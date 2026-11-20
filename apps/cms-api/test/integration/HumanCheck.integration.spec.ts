import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import {
  MAIL_SENDER,
  type MailMessage,
  type MailSender,
} from '../../src/infrastructure/mail/Mail.port';
import {
  HUMAN_CHECK_ERROR_CODES,
  HUMAN_CHECK_FORMS,
  TURNSTILE_VERIFIER,
  type HumanCheckForm,
  type HumanCheckOutcome,
  type TurnstileVerifier,
} from '../../src/modules/human-check';
import { TURNSTILE_TOKEN_MAX_LENGTH } from '../../src/modules/human-check/domain/HumanCheck.rules';
import { seedSystemRoles } from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/Env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const API = '/api/v1';
const SETUP_TOKEN = 'human-check-setup-token-0123456789';
const OCTET_RANGE = 250;
const IP_LOGIN_LIMIT = 10;
/** A token the fake verifier accepts only for the form it names. */
const passFor = (form: HumanCheckForm) => `pass:${form}`;
const FAILING_TOKEN = 'fail';
const UNREACHABLE_TOKEN = 'down';

class CapturingMailSender implements MailSender {
  readonly sent: MailMessage[] = [];
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

let emailCounter = 0;
function nextEmail(): string {
  emailCounter += 1;
  return `hc-user${emailCounter}@example.test`;
}

const verifierState = { isConfigured: true, verifyCalls: 0 };
const verifier: TurnstileVerifier = {
  get isConfigured() {
    return verifierState.isConfigured;
  },
  verify(token: string, _ip?: string, action?: string): Promise<HumanCheckOutcome> {
    verifierState.verifyCalls += 1;
    if (token === UNREACHABLE_TOKEN) return Promise.resolve('unavailable');
    return Promise.resolve(token === `pass:${action}` ? 'passed' : 'failed');
  },
};

interface GuardedRoute {
  readonly name: string;
  readonly path: string;
  readonly form: HumanCheckForm;
  /** A body that is valid apart from the token. */
  readonly body: () => Record<string, unknown>;
}

const GUARDED_ROUTES: readonly GuardedRoute[] = [
  {
    name: 'login',
    path: `${API}/auth/login`,
    form: HUMAN_CHECK_FORMS.LOGIN,
    body: () => ({ email: nextEmail(), password: 'some password value' }),
  },
  {
    name: '2fa verify',
    path: `${API}/auth/2fa/verify`,
    form: HUMAN_CHECK_FORMS.TWO_FACTOR,
    body: () => ({ tempToken: 'temp-token', code: '123456' }),
  },
  {
    name: '2fa email challenge',
    path: `${API}/auth/2fa/email-challenge`,
    form: HUMAN_CHECK_FORMS.TWO_FACTOR,
    body: () => ({ tempToken: 'temp-token' }),
  },
  {
    name: 'owner setup',
    path: `${API}/setup/owner`,
    form: HUMAN_CHECK_FORMS.OWNER_SETUP,
    body: () => ({
      setupToken: SETUP_TOKEN,
      email: nextEmail(),
      password: 'a long enough owner password',
    }),
  },
  {
    name: 'password request-otp',
    path: `${API}/auth/password/request-otp`,
    form: HUMAN_CHECK_FORMS.PASSWORD_RESET,
    body: () => ({ email: nextEmail() }),
  },
  {
    name: 'password reset',
    path: `${API}/auth/password/reset`,
    form: HUMAN_CHECK_FORMS.PASSWORD_RESET,
    body: () => ({ email: nextEmail(), code: '123456', newPassword: 'a new long password' }),
  },
];

describe('human check on the six public auth routes (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  const mail = new CapturingMailSender();

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
        OWNER_SETUP_TOKEN: SETUP_TOKEN,
      }),
      [
        { token: TURNSTILE_VERIFIER, value: verifier },
        { token: MAIL_SENDER, value: mail },
      ],
      [],
      { humanCheck: 'real' },
    );
  });

  beforeEach(() => {
    verifierState.isConfigured = true;
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const post = (path: string, body: object, ip = nextIp()) =>
    request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip).send(body);

  const auditCount = () => db.prisma.auditLog.count();

  function refusalOf(res: request.Response) {
    return { status: res.status, errorCode: (res.body as { errorCode?: string }).errorCode };
  }

  describe.each(GUARDED_ROUTES)('$name', (route) => {
    it('refuses a missing, oversized, failed or wrong-form token with 400 and does no work', async () => {
      const auditsBefore = await auditCount();
      const mailBefore = mail.sent.length;
      const wrongForm = passFor(
        route.form === HUMAN_CHECK_FORMS.LOGIN
          ? HUMAN_CHECK_FORMS.TWO_FACTOR
          : HUMAN_CHECK_FORMS.LOGIN,
      );
      const tokens: (string | undefined)[] = [
        undefined,
        'x'.repeat(TURNSTILE_TOKEN_MAX_LENGTH + 1),
        FAILING_TOKEN,
        wrongForm,
      ];
      for (const turnstileToken of tokens) {
        const res = await post(route.path, { ...route.body(), turnstileToken });
        expect(refusalOf(res)).toEqual({ status: 400, errorCode: HUMAN_CHECK_ERROR_CODES.FAILED });
      }
      expect(await auditCount()).toBe(auditsBefore);
      expect(mail.sent.length).toBe(mailBefore);
    });

    it('answers 503 when the verifier is unreachable or not configured', async () => {
      const unreachable = await post(route.path, {
        ...route.body(),
        turnstileToken: UNREACHABLE_TOKEN,
      });
      expect(refusalOf(unreachable)).toEqual({
        status: 503,
        errorCode: HUMAN_CHECK_ERROR_CODES.UNAVAILABLE,
      });

      verifierState.isConfigured = false;
      const unconfigured = await post(route.path, {
        ...route.body(),
        turnstileToken: passFor(route.form),
      });
      expect(refusalOf(unconfigured)).toEqual({
        status: 503,
        errorCode: HUMAN_CHECK_ERROR_CODES.UNAVAILABLE,
      });
    });

    it('lets a passing token reach the route, which answers as usual', async () => {
      const res = await post(route.path, { ...route.body(), turnstileToken: passFor(route.form) });
      const errorCode = (res.body as { errorCode?: string }).errorCode ?? '';
      expect(errorCode).not.toMatch(/^HUMAN_CHECK/);
      expect(res.status).not.toBe(503);
      expect(res.status).not.toBe(429);
    });
  });

  describe('rate limits around the check', () => {
    it('still counts the IP limit on refusals', async () => {
      const ip = nextIp();
      let last = 0;
      for (let i = 0; i <= IP_LOGIN_LIMIT; i += 1) {
        last = (await post(GUARDED_ROUTES[0]!.path, { ...GUARDED_ROUTES[0]!.body() }, ip)).status;
      }
      expect(last).toBe(429);
    });

    it('charges no email limit on refusals', async () => {
      const login = GUARDED_ROUTES[0]!;
      const email = nextEmail();
      const body = { email, password: 'some password value' };
      for (let i = 0; i < IP_LOGIN_LIMIT; i += 1) {
        const res = await post(login.path, { ...body, turnstileToken: FAILING_TOKEN });
        expect(res.status).toBe(400);
      }
      const res = await post(login.path, { ...body, turnstileToken: passFor(login.form) });
      expect(res.status).toBe(401);
    });

    it('sends no email on a refused request-otp', async () => {
      const mailBefore = mail.sent.length;
      const res = await post(`${API}/auth/password/request-otp`, {
        email: nextEmail(),
        turnstileToken: FAILING_TOKEN,
      });
      expect(res.status).toBe(400);
      expect(mail.sent.length).toBe(mailBefore);
    });
  });

  describe('routes that need no token', () => {
    it.each([
      ['refresh', `${API}/auth/refresh`],
      ['logout', `${API}/auth/logout`],
      ['password set', `${API}/auth/password/set`],
    ])('%s ignores the human check', async (_name, path) => {
      const callsBefore = verifierState.verifyCalls;
      const res = await post(path, {
        email: nextEmail(),
        code: '123456',
        newPassword: 'a new long password',
      }).set('Origin', TEST_ADMIN_ORIGIN);
      const errorCode = (res.body as { errorCode?: string }).errorCode ?? '';
      expect(errorCode).not.toMatch(/^HUMAN_CHECK/);
      expect(verifierState.verifyCalls).toBe(callsBefore);
    });

    it('me needs no token', async () => {
      const res = await request(app.getHttpServer()).get(`${API}/auth/me`);
      expect(res.status).toBe(401);
    });
  });
});

import { performance } from 'node:perf_hooks';

import { HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { Clock } from '../../src/common/time/clock';
import {
  AUTH_ERROR_CODES,
  OTP,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../src/modules/identity/domain/Identity.constants';
import { ERROR_CODES } from '../../src/common/constants/error.constants';
import { DOMAIN_ERROR_KINDS } from '../../src/common/errors/DomainErrorKinds.constants';
import { MS_PER_SECOND } from '../../src/common/constants/time.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from '../../src/modules/identity/http/IdentityHttp.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import {
  MAIL_SENDER,
  type MailMessage,
  type MailSender,
} from '../../src/infrastructure/mail/mail.port';
import { OtpService } from '../../src/modules/identity/application/Otp.service';
import {
  hashPassword,
  PasswordService,
} from '../../src/modules/identity/application/Password.service';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/env.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';
import { seedSystemRoles } from '../fixtures/access.fixture';

const AUTH = '/api/v1/auth';
const LOGIN = `${AUTH}/login`;
const REFRESH = `${AUTH}/refresh`;
const ME = `${AUTH}/me`;
const REQUEST_OTP = `${AUTH}/password/request-otp`;
const RESET = `${AUTH}/password/reset`;
const SET = `${AUTH}/password/set`;
const CHANGE = `${AUTH}/password/change`;

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase 42';
const WRONG_CODE_OFFSET = 1;
const CODE_IN_MAIL = new RegExp(`^(\\d{${OTP.DIGITS}})$`, 'm');
const TIMING_SAMPLES = 5;
/** Unknown-email requests must take at least / at most this share of known ones. */
const TIMING_RATIO = { min: 0.5, max: 2 };
const OCTET_RANGE = 250;

type Account = { id: number; documentId: string; email: string };

/** Records every message instead of sending it. */
class CapturingMailSender implements MailSender {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

let ipCounter = 0;
/** A fresh client IP per request, so the per-IP limits stay out of the way. */
function nextIp(): string {
  ipCounter += 1;
  return `10.1.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function wrongCodeFor(code: string): string {
  const next = (Number(code) + WRONG_CODE_OFFSET) % 10 ** OTP.DIGITS;
  return next.toString().padStart(OTP.DIGITS, '0');
}

/** The unified error body without its per-request id. */
function errorBody(res: request.Response): unknown {
  const { requestId, ...rest } = res.body as Record<string, unknown>;
  expect(typeof requestId).toBe('string');
  return rest;
}

function errorCodeOf(res: request.Response): unknown {
  return (res.body as { errorCode?: unknown }).errorCode;
}

describe('OTP + password lifecycle (D8, SPEC §12-9/10; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let mail: CapturingMailSender;
  let accountCount = 0;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    mail = new CapturingMailSender();
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
      }),
      [{ token: MAIL_SENDER, value: mail }],
    );
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** POST from a fresh client IP. */
  function post(path: string, ip = nextIp()) {
    return request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip);
  }

  async function createAccount(
    overrides: {
      status?: 'invited' | 'active' | 'disabled';
      deleted?: boolean;
      twoFa?: 'totp' | 'email';
    } = {},
  ): Promise<Account> {
    accountCount += 1;
    const invited = overrides.status === 'invited';
    return db.prisma.account.create({
      data: {
        email: `pw-user${accountCount}@example.test`,
        displayName: `User ${accountCount}`,
        passwordHash: invited ? null : await hashPassword(PASSWORD),
        status: overrides.status ?? 'active',
        deletedAt: overrides.deleted === true ? new Date() : null,
        is2faEnabled: overrides.twoFa !== undefined,
        twoFaMethod: overrides.twoFa ?? null,
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  async function settle(): Promise<void> {
    await app.get(PasswordService).whenIdle();
  }

  function mailsTo(email: string): MailMessage[] {
    return mail.sent.filter((message) => message.to === email);
  }

  /** Requests a code over HTTP and reads it from the captured email. */
  async function requestCode(email: string): Promise<string> {
    const res = await post(REQUEST_OTP).send({ email });
    expect(res.status).toBe(HttpStatus.ACCEPTED);
    await settle();
    const last = mailsTo(email).at(-1);
    const code = last?.text.match(CODE_IN_MAIL)?.[1];
    if (code === undefined) throw new Error(`no code mailed to ${email}`);
    return code;
  }

  function reset(email: string, code: string, extra: object = {}) {
    return post(RESET).send({
      email,
      code,
      newPassword: NEW_PASSWORD,
      ...extra,
    });
  }

  async function signIn(email: string, password = PASSWORD) {
    const res = await post(LOGIN).send({ email, password });
    expect(res.status).toBe(HttpStatus.OK);
    const cookies = ([] as string[]).concat(
      (res.headers['set-cookie'] as string[] | string | undefined) ?? [],
    );
    return {
      accessToken: (res.body as { accessToken: string }).accessToken,
      cookie: cookies[0]?.split(';')[0] ?? '',
    };
  }

  function me(accessToken: string) {
    return request(app.getHttpServer())
      .get(ME)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  describe('POST /auth/password/request-otp', () => {
    it('answers known and unknown emails with the same 202 and empty body', async () => {
      const account = await createAccount();
      const known = await post(REQUEST_OTP).send({ email: account.email });
      const unknown = await post(REQUEST_OTP).send({
        email: 'nobody-here@example.test',
      });
      await settle();

      for (const res of [known, unknown]) {
        expect(res.status).toBe(HttpStatus.ACCEPTED);
        expect(res.text).toBe('');
      }
      const headerNames = (res: request.Response) =>
        Object.keys(res.headers).sort();
      expect(headerNames(unknown)).toEqual(headerNames(known));
      expect(mailsTo(account.email)).toHaveLength(1);
      expect(mailsTo('nobody-here@example.test')).toHaveLength(0);
    });

    it('takes about the same time for known and unknown emails', async () => {
      const accounts = await Promise.all(
        Array.from({ length: TIMING_SAMPLES }, () => createAccount()),
      );
      const time = async (email: string): Promise<number> => {
        const started = performance.now();
        const res = await post(REQUEST_OTP).send({ email });
        expect(res.status).toBe(HttpStatus.ACCEPTED);
        return performance.now() - started;
      };
      const known: number[] = [];
      const unknown: number[] = [];
      for (const [i, account] of accounts.entries()) {
        known.push(await time(account.email));
        unknown.push(await time(`ghost-timing${i}@example.test`));
      }
      await settle();
      const ratio = median(unknown) / median(known);
      expect(ratio).toBeGreaterThan(TIMING_RATIO.min);
      expect(ratio).toBeLessThan(TIMING_RATIO.max);
    });

    it('mails a 6-digit RESET_PASSWORD code with the admin URL, stored only as an HMAC', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      const [message] = mailsTo(account.email);

      expect(code).toMatch(new RegExp(`^\\d{${OTP.DIGITS}}$`));
      expect(message?.subject).toMatch(/password reset/i);
      expect(message?.text).toContain(`${TEST_ADMIN_ORIGIN}/reset-password`);
      const rows = await db.prisma.otpCode.findMany({
        where: { accountId: account.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.purpose).toBe('RESET_PASSWORD');
      expect(rows[0]?.codeHmac).not.toContain(code);
      expect(
        (rows[0]?.expiresAt.getTime() ?? 0) -
          (rows[0]?.createdAt.getTime() ?? 0),
      ).toBe(OTP.TTL_SECONDS * MS_PER_SECOND);
    });

    it('mails an INVITE_SET_PASSWORD code to invited accounts', async () => {
      const account = await createAccount({ status: 'invited' });
      await requestCode(account.email);
      expect(mailsTo(account.email)[0]?.text).toContain(
        `${TEST_ADMIN_ORIGIN}/set-password`,
      );
      const row = await db.prisma.otpCode.findFirst({
        where: { accountId: account.id },
      });
      expect(row?.purpose).toBe('INVITE_SET_PASSWORD');
    });

    it.each([{ status: 'disabled' as const }, { deleted: true }])(
      'sends nothing to %o accounts but still answers 202',
      async (overrides) => {
        const account = await createAccount(overrides);
        const res = await post(REQUEST_OTP).send({ email: account.email });
        await settle();
        expect(res.status).toBe(HttpStatus.ACCEPTED);
        expect(mailsTo(account.email)).toHaveLength(0);
      },
    );

    it('answers the 6th request per email within the hour with 429, known or not (§12-9)', async () => {
      const account = await createAccount();
      const [, emailRule] = IDENTITY_RATE_LIMIT_POLICIES.OTP_REQUEST;
      for (const email of [account.email, 'ghost-limit@example.test']) {
        for (let i = 0; i < emailRule.maxHits; i += 1) {
          expect((await post(REQUEST_OTP).send({ email })).status).toBe(
            HttpStatus.ACCEPTED,
          );
        }
        const sixth = await post(REQUEST_OTP).send({ email });
        expect(sixth.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(errorCodeOf(sixth)).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
      }
      await settle();
    });

    it('rejects a malformed body with 400', async () => {
      const res = await post(REQUEST_OTP).send({ mail: 'x@example.test' });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_REQUEST);
    });
  });

  describe('OtpService issue cap', () => {
    it('refuses a 6th code per account within the hour, across purposes', async () => {
      const account = await createAccount();
      const otp = app.get(OtpService);
      for (let i = 0; i < OTP.MAX_ISSUED_PER_WINDOW; i += 1) {
        await otp.issue(
          account.id,
          i % 2 === 0 ? 'RESET_PASSWORD' : 'LOGIN_2FA_EMAIL',
        );
      }
      await expect(
        otp.issue(account.id, 'INVITE_SET_PASSWORD'),
      ).rejects.toMatchObject({
        kind: DOMAIN_ERROR_KINDS.RATE_LIMITED,
        errorCode: ERROR_CODES.TOO_MANY_REQUESTS,
      });
    });

    it('allows codes again once the hour has passed', async () => {
      const account = await createAccount();
      const otp = app.get(OtpService);
      for (let i = 0; i < OTP.MAX_ISSUED_PER_WINDOW; i += 1) {
        await otp.issue(account.id, 'RESET_PASSWORD');
      }
      const later = Date.now() + OTP.ISSUE_WINDOW_MS + MS_PER_SECOND;
      jest.spyOn(app.get(Clock), 'now').mockReturnValue(later);
      await expect(otp.issue(account.id, 'RESET_PASSWORD')).resolves.toMatch(
        /^\d+$/,
      );
    });
  });

  describe('POST /auth/password/reset', () => {
    it('sets the new password, ends every session and old access tokens get 401 (§12-10)', async () => {
      const account = await createAccount();
      const session = await signIn(account.email);
      expect((await me(session.accessToken)).status).toBe(HttpStatus.OK);

      const code = await requestCode(account.email);
      const res = await reset(account.email, code);
      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(res.headers['set-cookie']).toBeUndefined();

      expect((await me(session.accessToken)).status).toBe(
        HttpStatus.UNAUTHORIZED,
      );
      const refreshed = await post(REFRESH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', session.cookie);
      expect(refreshed.status).toBe(HttpStatus.UNAUTHORIZED);

      const oldLogin = await post(LOGIN).send({
        email: account.email,
        password: PASSWORD,
      });
      expect(oldLogin.status).toBe(HttpStatus.UNAUTHORIZED);
      await signIn(account.email, NEW_PASSWORD);
    });

    it('accepts a code only once (single use)', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      expect((await reset(account.email, code)).status).toBe(
        HttpStatus.NO_CONTENT,
      );
      const again = await reset(account.email, code);
      expect(again.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(again)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
    });

    it('lets only one of two concurrent requests use the same code', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      const results = await Promise.all([
        reset(account.email, code),
        reset(account.email, code),
      ]);
      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([HttpStatus.NO_CONTENT, HttpStatus.BAD_REQUEST]);
    });

    it('accepts the right code on the 5th attempt', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      for (let i = 1; i < OTP.MAX_ATTEMPTS; i += 1) {
        expect((await reset(account.email, wrongCodeFor(code))).status).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
      expect((await reset(account.email, code)).status).toBe(
        HttpStatus.NO_CONTENT,
      );
    });

    it('fails the 6th attempt even with the right code (§12-9)', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      for (let i = 0; i < OTP.MAX_ATTEMPTS; i += 1) {
        const res = await reset(account.email, wrongCodeFor(code));
        expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
      }
      const sixth = await reset(account.email, code);
      expect(sixth.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(sixth)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
    });

    it('rejects an expired code', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      const expired = Date.now() + (OTP.TTL_SECONDS + 1) * MS_PER_SECOND;
      jest.spyOn(app.get(Clock), 'now').mockReturnValue(expired);
      const res = await reset(account.email, code);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
    });

    it('invalidates the earlier code when a new one is issued', async () => {
      const account = await createAccount();
      const first = await requestCode(account.email);
      const second = await requestCode(account.email);
      // Equal codes (1 in a million) would make this check meaningless.
      expect(second).not.toBe(first);
      expect(errorCodeOf(await reset(account.email, first))).toBe(
        AUTH_ERROR_CODES.INVALID_OTP,
      );
      expect((await reset(account.email, second)).status).toBe(
        HttpStatus.NO_CONTENT,
      );
    });

    it('answers unknown emails exactly like a wrong code', async () => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      const unknown = await reset('ghost-reset@example.test', code);
      const wrong = await reset(account.email, wrongCodeFor(code));
      expect(errorBody(unknown)).toEqual(errorBody(wrong));
      expect(errorBody(wrong)).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: AUTH_ERROR_CODES.INVALID_OTP,
      });
    });

    it('does not accept an invite code (purpose-bound)', async () => {
      const account = await createAccount();
      const otp = app.get(OtpService);
      const inviteCode = await otp.issue(account.id, 'INVITE_SET_PASSWORD');
      const res = await reset(account.email, inviteCode);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
    });

    it.each([
      'x'.repeat(PASSWORD_MIN_LENGTH - 1),
      'x'.repeat(PASSWORD_MAX_LENGTH + 1),
    ])('rejects a new password of length %#', async (newPassword) => {
      const account = await createAccount();
      const code = await requestCode(account.email);
      const res = await reset(account.email, code, { newPassword });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.WEAK_PASSWORD);
      // The code was not touched: it still works.
      expect((await reset(account.email, code)).status).toBe(
        HttpStatus.NO_CONTENT,
      );
    });

    it('requires a TOTP code when TOTP is enabled, and keeps the email code', async () => {
      const account = await createAccount({ twoFa: 'totp' });
      const code = await requestCode(account.email);
      const res = await reset(account.email, code, { totpCode: '123456' });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.TOTP_REQUIRED);
      const row = await db.prisma.otpCode.findFirst({
        where: { accountId: account.id },
      });
      expect(row?.usedAt).toBeNull();
    });

    it('needs no TOTP for email-2FA accounts', async () => {
      const account = await createAccount({ twoFa: 'email' });
      const code = await requestCode(account.email);
      expect((await reset(account.email, code)).status).toBe(
        HttpStatus.NO_CONTENT,
      );
    });

    it('does not reset invited accounts', async () => {
      const account = await createAccount({ status: 'invited' });
      const code = await requestCode(account.email);
      expect(errorCodeOf(await reset(account.email, code))).toBe(
        AUTH_ERROR_CODES.INVALID_OTP,
      );
    });
  });

  describe('POST /auth/password/set (invite)', () => {
    it('sets the password, activates the account and allows login', async () => {
      const account = await createAccount({ status: 'invited' });
      const code = await requestCode(account.email);
      const res = await post(SET).send({
        email: account.email,
        code,
        newPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(HttpStatus.NO_CONTENT);

      const stored = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
        select: { status: true, tokenVersion: true },
      });
      expect(stored.status).toBe('active');
      await signIn(account.email, NEW_PASSWORD);
    });

    it('rejects a reset code and active accounts', async () => {
      const active = await createAccount();
      const code = await requestCode(active.email);
      const res = await post(SET).send({
        email: active.email,
        code,
        newPassword: NEW_PASSWORD,
      });
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_OTP);
    });
  });

  describe('POST /auth/password/change', () => {
    it('needs a valid access token', async () => {
      const res = await post(CHANGE).send({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects a wrong current password with 403, keeping the session (T13 Q14)', async () => {
      const account = await createAccount();
      const { accessToken } = await signIn(account.email);
      const res = await post(CHANGE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      expect((await me(accessToken)).status).toBe(HttpStatus.OK);
    });

    it('changes the password and ends every session, the current one included', async () => {
      const account = await createAccount();
      const session = await signIn(account.email);
      const res = await post(CHANGE)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(HttpStatus.NO_CONTENT);

      expect((await me(session.accessToken)).status).toBe(
        HttpStatus.UNAUTHORIZED,
      );
      const refreshed = await post(REFRESH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', session.cookie);
      expect(refreshed.status).toBe(HttpStatus.UNAUTHORIZED);
      await signIn(account.email, NEW_PASSWORD);
    });

    it('throttles the 6th change per IP within 15 minutes', async () => {
      const [rule] = IDENTITY_RATE_LIMIT_POLICIES.PASSWORD_CHANGE;
      const ip = nextIp();
      for (let i = 0; i < rule.maxHits; i += 1) {
        await post(CHANGE, ip).send({});
      }
      const res = await post(CHANGE, ip).send({});
      expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});

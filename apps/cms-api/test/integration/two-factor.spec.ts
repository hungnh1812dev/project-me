import { HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { generate } from 'otplib';
import request from 'supertest';

import { Clock } from '../../src/common/time/clock';
import {
  AUTH_ERROR_CODES,
  TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS,
  TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
} from '../../src/modules/identity/identity-auth.constants';
import { ERROR_CODES } from '../../src/common/constants/error.constants';
import { MS_PER_SECOND } from '../../src/common/constants/time.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from '../../src/modules/identity/identity.rate-limits.constants';
import { loadAppConfig } from '../../src/config/app-config';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import {
  MAIL_SENDER,
  type MailMessage,
  type MailSender,
} from '../../src/infrastructure/mail/mail.port';
import {
  AUDIT_ACTIONS,
  type AuditAction,
} from '../../src/modules/security-audit/security-audit.constants';
import { SecretBox } from '../../src/modules/identity/crypto/secret-box';
import {
  OTP,
  TOTP,
  TWO_FACTOR_RESET_ERRORS,
} from '../../src/modules/identity/identity.constants';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { PasswordService } from '../../src/modules/identity/password.service';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
import { resetTwoFactor } from '../../src/modules/identity/two-factor-reset';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_TOTP_ENC_KID,
  TEST_TOTP_ENC_PREVIOUS_KID,
  TEST_WEB_ORIGIN,
} from '../fixtures/env.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

const AUTH = '/api/v1/auth';
const LOGIN = `${AUTH}/login`;
const ME = `${AUTH}/me`;
const RESET = `${AUTH}/password/reset`;
const REQUEST_OTP = `${AUTH}/password/request-otp`;
const SETUP = `${AUTH}/2fa/totp/setup`;
const ENABLE = `${AUTH}/2fa/enable`;
const DISABLE = `${AUTH}/2fa/disable`;
const VERIFY = `${AUTH}/2fa/verify`;
const EMAIL_CHALLENGE = `${AUTH}/2fa/email-challenge`;
const SEND_CODE = `${AUTH}/2fa/email/send-code`;

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase 42';
const PREVIOUS_TOTP_KEY = 'previous-totp-key-0123456789abcdef';
const CODE_IN_MAIL = new RegExp(`^(\\d{${OTP.DIGITS}})$`, 'm');
const OCTET_RANGE = 250;
const STEP_MS = TOTP.PERIOD_SECONDS * MS_PER_SECOND;

type Account = { id: number; documentId: string; email: string };

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
  return `10.2.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

function errorCodeOf(res: request.Response): unknown {
  return (res.body as { errorCode?: unknown }).errorCode;
}

function setCookies(res: request.Response): string[] {
  return ([] as string[]).concat(
    (res.headers['set-cookie'] as string[] | string | undefined) ?? [],
  );
}

describe('Two-factor authentication (D8, SPEC §9, T13; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let mail: CapturingMailSender;
  let accountCount = 0;
  /** Fake epoch ms behind Clock; tests move it a TOTP step at a time. */
  let now = 0;

  const appEnv = (databaseUrl: string) =>
    devEnv({
      ...dbEnvOf(databaseUrl),
      JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
      JWT_ACCESS_KID: TEST_JWT_KID,
      OTP_PEPPER: TEST_SECRET_32_BYTES,
      TOTP_ENC_KEY: TEST_SECRET_32_BYTES,
      TOTP_ENC_KID: TEST_TOTP_ENC_KID,
      TOTP_ENC_PREVIOUS_KEY: PREVIOUS_TOTP_KEY,
      TOTP_ENC_PREVIOUS_KID: TEST_TOTP_ENC_PREVIOUS_KID,
      ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      TRUST_PROXY_HOPS: '1',
    });

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    mail = new CapturingMailSender();
    app = await createTestApp(appEnv(databaseUrl), [
      { token: MAIL_SENDER, value: mail },
    ]);
    // Listen once: supertest then reuses the server instead of opening and
    // closing it per request, so a request built before an awaited one
    // inside its body (e.g. a fresh temp token) still finds it open.
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  function post(path: string, ip = nextIp()) {
    return request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip);
  }

  function authed(path: string, accessToken: string) {
    return post(path).set('Authorization', `Bearer ${accessToken}`);
  }

  function me(accessToken: string) {
    return request(app.getHttpServer())
      .get(ME)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  /** The TOTP code of the current fake time. */
  function totpNow(secret: string): Promise<string> {
    return generate({ secret, epoch: Math.floor(now / MS_PER_SECOND) });
  }

  /** Moves the fake clock to the next TOTP step (a fresh, non-replayed code). */
  function nextStep(): void {
    now += STEP_MS;
  }

  /** Metadata of the audit rows of `action` that target the account. */
  async function auditMetadata(action: AuditAction, documentId: string) {
    const rows = await db.prisma.auditLog.findMany({
      where: { action, targetId: documentId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => row.metadata);
  }

  async function createAccount(): Promise<Account> {
    accountCount += 1;
    return db.prisma.account.create({
      data: {
        email: `tf-user${accountCount}@example.test`,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  async function signIn(email: string): Promise<string> {
    const res = await post(LOGIN).send({ email, password: PASSWORD });
    expect(res.status).toBe(HttpStatus.OK);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function loginForTempToken(email: string): Promise<string> {
    const res = await post(LOGIN).send({ email, password: PASSWORD });
    expect(res.status).toBe(HttpStatus.OK);
    const body = res.body as { requires2FA?: boolean; tempToken?: string };
    expect(body.requires2FA).toBe(true);
    return body.tempToken ?? '';
  }

  function lastCodeMailedTo(email: string): string {
    const message = mail.sent.filter((m) => m.to === email).at(-1);
    const code = message?.text.match(CODE_IN_MAIL)?.[1];
    if (code === undefined) throw new Error(`no code mailed to ${email}`);
    return code;
  }

  /** Signs in, sets up and enables TOTP; returns the secret and a fresh token. */
  async function withTotp(account: Account) {
    const accessToken = await signIn(account.email);
    const setup = await authed(SETUP, accessToken).send();
    expect(setup.status).toBe(HttpStatus.OK);
    const { secret } = setup.body as { secret: string };
    const enabled = await authed(ENABLE, accessToken).send({
      method: 'totp',
      password: PASSWORD,
      code: await totpNow(secret),
    });
    expect(enabled.status).toBe(HttpStatus.NO_CONTENT);
    nextStep();
    return { secret, accessToken };
  }

  async function withEmail2fa(account: Account) {
    const accessToken = await signIn(account.email);
    expect((await authed(SEND_CODE, accessToken).send()).status).toBe(
      HttpStatus.ACCEPTED,
    );
    const enabled = await authed(ENABLE, accessToken).send({
      method: 'email',
      password: PASSWORD,
      code: lastCodeMailedTo(account.email),
    });
    expect(enabled.status).toBe(HttpStatus.NO_CONTENT);
    return { accessToken };
  }

  describe('TOTP setup and enable', () => {
    it('needs a Bearer token', async () => {
      expect((await post(SETUP).send()).status).toBe(HttpStatus.UNAUTHORIZED);
      expect((await post(ENABLE).send({})).status).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });

    it('returns an otpauth URI and stores only the encrypted secret', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      const res = await authed(SETUP, accessToken).send();
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.body as { otpauthUri: string; secret: string };
      expect(body.otpauthUri).toContain(`secret=${body.secret}`);
      expect(body.otpauthUri.startsWith('otpauth://totp/')).toBe(true);

      const row = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
        select: {
          is2faEnabled: true,
          totpSecretEnc: true,
          totpSecretKid: true,
        },
      });
      expect(row.is2faEnabled).toBe(false);
      expect(row.totpSecretKid).toBe(TEST_TOTP_ENC_KID);
      expect(row.totpSecretEnc).not.toContain(body.secret);
    });

    it('rejects enable before setup', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      const res = await authed(ENABLE, accessToken).send({
        method: 'totp',
        password: PASSWORD,
        code: '123456',
      });
      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.TWO_FACTOR_SETUP_REQUIRED);
    });

    it('rejects a wrong password with 403 and keeps the session', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      const setup = await authed(SETUP, accessToken).send();
      const { secret } = setup.body as { secret: string };
      const res = await authed(ENABLE, accessToken).send({
        method: 'totp',
        password: NEW_PASSWORD,
        code: await totpNow(secret),
      });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      expect((await me(accessToken)).status).toBe(HttpStatus.OK);
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_MANAGE_FAILED,
          account.documentId,
        ),
      ).toEqual([{ operation: 'enable', reason: 'bad_password' }]);
    });

    it('rejects a wrong first code with 403', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      await authed(SETUP, accessToken).send();
      const res = await authed(ENABLE, accessToken).send({
        method: 'totp',
        password: PASSWORD,
        code: '000000',
      });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_MANAGE_FAILED,
          account.documentId,
        ),
      ).toEqual([{ operation: 'enable', reason: 'bad_code' }]);
    });

    it('enables TOTP, shows it in /me and refuses a second setup', async () => {
      const account = await createAccount();
      const { accessToken } = await withTotp(account);
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
          account.documentId,
        ),
      ).toEqual([{ method: 'totp' }]);
      // Enabling does not end the session (T13 Q10).
      const profile = await me(accessToken);
      expect(profile.status).toBe(HttpStatus.OK);
      expect(profile.body).toMatchObject({
        twoFactorEnabled: true,
        twoFactorMethod: 'totp',
      });
      const again = await authed(SETUP, accessToken).send();
      expect(again.status).toBe(HttpStatus.CONFLICT);
      expect(errorCodeOf(again)).toBe(
        AUTH_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED,
      );
    });

    it('rejects a malformed body', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      const res = await authed(ENABLE, accessToken).send({ method: 'sms' });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_REQUEST);
    });
  });

  describe('login with TOTP (POST /auth/2fa/verify)', () => {
    it('signs in with a valid code and sets the refresh cookie', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const login = await post(LOGIN).send({
        email: account.email,
        password: PASSWORD,
      });
      expect(login.body).toMatchObject({
        requires2FA: true,
        methods: ['totp'],
      });
      expect(setCookies(login)).toEqual([]);

      const res = await post(VERIFY).send({
        tempToken: (login.body as { tempToken: string }).tempToken,
        code: await totpNow(secret),
      });
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.headers['cache-control']).toBe('no-store');
      const { accessToken } = res.body as { accessToken: string };
      expect((await me(accessToken)).status).toBe(HttpStatus.OK);
      expect(setCookies(res)).toHaveLength(1);
      // The TOTP-enable flow signed in once with the password only.
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
          account.documentId,
        ),
      ).toContainEqual({ twoFactorMethod: 'totp' });
    });

    it('rejects a replayed code, even with a new temp token', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const code = await totpNow(secret);
      const first = await post(VERIFY).send({
        tempToken: await loginForTempToken(account.email),
        code,
      });
      expect(first.status).toBe(HttpStatus.OK);

      const replay = await post(VERIFY).send({
        tempToken: await loginForTempToken(account.email),
        code,
      });
      expect(replay.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorCodeOf(replay)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
    });

    it('kills the temp token after 5 wrong codes, even for the right code', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const tempToken = await loginForTempToken(account.email);
      for (let i = 0; i < TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS; i += 1) {
        const wrong = await post(VERIFY).send({ tempToken, code: '000000' });
        expect(errorCodeOf(wrong)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
      }
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_VERIFY_FAILED,
          account.documentId,
        ),
      ).toHaveLength(TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS);
      const res = await post(VERIFY).send({
        tempToken,
        code: await totpNow(secret),
      });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);
    });

    it('rejects an expired temp token', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const tempToken = await loginForTempToken(account.email);
      now += (TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS + 1) * MS_PER_SECOND;
      const res = await post(VERIFY).send({
        tempToken,
        code: await totpNow(secret),
      });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);
    });

    it('uses a temp token once', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const tempToken = await loginForTempToken(account.email);
      const ok = await post(VERIFY).send({
        tempToken,
        code: await totpNow(secret),
      });
      expect(ok.status).toBe(HttpStatus.OK);
      nextStep();
      const again = await post(VERIFY).send({
        tempToken,
        code: await totpNow(secret),
      });
      expect(errorCodeOf(again)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);
    });

    it('does not take an access token or garbage as a temp token', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      for (const tempToken of [accessToken, 'not-a-jwt']) {
        const res = await post(VERIFY).send({ tempToken, code: '123456' });
        expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
        expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);
      }
    });

    it('re-encrypts a secret sealed with the previous key after a valid code', async () => {
      const account = await createAccount();
      const previousBox = new SecretBox(
        loadAppConfig(
          devEnv({
            TOTP_ENC_KEY: PREVIOUS_TOTP_KEY,
            TOTP_ENC_KID: TEST_TOTP_ENC_PREVIOUS_KID,
          }),
        ),
      );
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const sealed = previousBox.seal(secret, account.documentId);
      await db.prisma.account.update({
        where: { id: account.id },
        data: {
          is2faEnabled: true,
          twoFaMethod: 'totp',
          totpSecretEnc: sealed.ciphertext,
          totpSecretKid: sealed.kid,
        },
      });
      const res = await post(VERIFY).send({
        tempToken: await loginForTempToken(account.email),
        code: await totpNow(secret),
      });
      expect(res.status).toBe(HttpStatus.OK);
      const row = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
        select: { totpSecretKid: true, totpLastStep: true },
      });
      expect(row.totpSecretKid).toBe(TEST_TOTP_ENC_KID);
      expect(row.totpLastStep).toBe(
        Math.floor(now / MS_PER_SECOND / TOTP.PERIOD_SECONDS),
      );
    });

    it('fails closed for a secret under an unknown kid', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      await db.prisma.account.update({
        where: { id: account.id },
        data: { totpSecretKid: 'retired-kid' },
      });
      const res = await post(VERIFY).send({
        tempToken: await loginForTempToken(account.email),
        code: await totpNow(secret),
      });
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
    });
  });

  describe('disable', () => {
    it('needs the password and a valid code, then clears the secret', async () => {
      const account = await createAccount();
      const { secret, accessToken } = await withTotp(account);

      const wrongPassword = await authed(DISABLE, accessToken).send({
        password: NEW_PASSWORD,
        code: await totpNow(secret),
      });
      expect(wrongPassword.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(wrongPassword)).toBe(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      );

      const wrongCode = await authed(DISABLE, accessToken).send({
        password: PASSWORD,
        code: '000000',
      });
      expect(wrongCode.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(wrongCode)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);

      const ok = await authed(DISABLE, accessToken).send({
        password: PASSWORD,
        code: await totpNow(secret),
      });
      expect(ok.status).toBe(HttpStatus.NO_CONTENT);
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_MANAGE_FAILED,
          account.documentId,
        ),
      ).toEqual([
        { operation: 'disable', reason: 'bad_password' },
        { operation: 'disable', reason: 'bad_code' },
      ]);
      expect(
        await auditMetadata(
          AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
          account.documentId,
        ),
      ).toEqual([{ method: 'totp' }]);
      const row = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
        select: {
          is2faEnabled: true,
          twoFaMethod: true,
          totpSecretEnc: true,
          totpSecretKid: true,
          totpLastStep: true,
        },
      });
      expect(row).toEqual({
        is2faEnabled: false,
        twoFaMethod: null,
        totpSecretEnc: null,
        totpSecretKid: null,
        totpLastStep: null,
      });
      // A password-only login works again.
      await signIn(account.email);
    });

    it('answers 409 when 2FA is off', async () => {
      const account = await createAccount();
      const accessToken = await signIn(account.email);
      const res = await authed(DISABLE, accessToken).send({
        password: PASSWORD,
        code: '123456',
      });
      expect(res.status).toBe(HttpStatus.CONFLICT);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
    });
  });

  describe('email 2FA', () => {
    it('enables with an emailed code, signs in through email-challenge and disables', async () => {
      const account = await createAccount();
      const { accessToken } = await withEmail2fa(account);
      expect((await me(accessToken)).body).toMatchObject({
        twoFactorMethod: 'email',
      });

      const login = await post(LOGIN).send({
        email: account.email,
        password: PASSWORD,
      });
      expect(login.body).toMatchObject({ methods: ['email'] });
      const { tempToken } = login.body as { tempToken: string };
      const challenge = await post(EMAIL_CHALLENGE).send({ tempToken });
      expect(challenge.status).toBe(HttpStatus.ACCEPTED);
      const verified = await post(VERIFY).send({
        tempToken,
        code: lastCodeMailedTo(account.email),
      });
      expect(verified.status).toBe(HttpStatus.OK);

      await authed(SEND_CODE, accessToken).send();
      const off = await authed(DISABLE, accessToken).send({
        password: PASSWORD,
        code: lastCodeMailedTo(account.email),
      });
      expect(off.status).toBe(HttpStatus.NO_CONTENT);
      for (const action of [
        AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
        AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
      ]) {
        expect(await auditMetadata(action, account.documentId)).toEqual([
          { method: 'email' },
        ]);
      }
      const issued = await auditMetadata(
        AUDIT_ACTIONS.AUTH_OTP_ISSUED,
        account.documentId,
      );
      expect(issued.length).toBeGreaterThanOrEqual(3);
      expect(issued).toContainEqual({ purpose: 'LOGIN_2FA_EMAIL' });
    });

    it('rejects a used email code', async () => {
      const account = await createAccount();
      await withEmail2fa(account);
      const tempToken = await loginForTempToken(account.email);
      await post(EMAIL_CHALLENGE).send({ tempToken });
      const code = lastCodeMailedTo(account.email);
      expect((await post(VERIFY).send({ tempToken, code })).status).toBe(
        HttpStatus.OK,
      );
      const again = await post(VERIFY).send({
        tempToken: await loginForTempToken(account.email),
        code,
      });
      expect(errorCodeOf(again)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
    });

    it('sends no email to TOTP accounts', async () => {
      const account = await createAccount();
      await withTotp(account);
      const before = mail.sent.length;
      const res = await post(EMAIL_CHALLENGE).send({
        tempToken: await loginForTempToken(account.email),
      });
      expect(res.status).toBe(HttpStatus.ACCEPTED);
      expect(mail.sent.length).toBe(before);
    });

    it('rejects an invalid temp token', async () => {
      const res = await post(EMAIL_CHALLENGE).send({ tempToken: 'nope' });
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);
    });
  });

  describe('password reset with TOTP (D8)', () => {
    async function resetCode(email: string): Promise<string> {
      await post(REQUEST_OTP).send({ email });
      await app.get(PasswordService).whenIdle();
      return lastCodeMailedTo(email);
    }

    it('resets with a valid TOTP code and rejects its replay', async () => {
      const account = await createAccount();
      const { secret } = await withTotp(account);
      const totpCode = await totpNow(secret);

      const ok = await post(RESET).send({
        email: account.email,
        code: await resetCode(account.email),
        newPassword: NEW_PASSWORD,
        totpCode,
      });
      expect(ok.status).toBe(HttpStatus.NO_CONTENT);

      const replay = await post(RESET).send({
        email: account.email,
        code: await resetCode(account.email),
        newPassword: PASSWORD,
        totpCode,
      });
      expect(replay.status).toBe(HttpStatus.BAD_REQUEST);
      expect(errorCodeOf(replay)).toBe(AUTH_ERROR_CODES.TOTP_REQUIRED);
    });
  });

  describe('owner:reset-2fa (T13a, break-glass)', () => {
    async function liveRefreshTokens(accountId: number): Promise<number> {
      return db.prisma.refreshToken.count({
        where: { accountId, revokedAt: null },
      });
    }

    it('turns TOTP off, clears the secret and ends every session', async () => {
      const account = await createAccount();
      const { accessToken } = await withTotp(account);
      const tempToken = await loginForTempToken(account.email);
      const before = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(await liveRefreshTokens(account.id)).toBeGreaterThan(0);

      const result = await resetTwoFactor(
        db.prisma,
        ` ${account.email.toUpperCase()} `,
      );
      expect(result).toEqual({ email: account.email, previousMethod: 'totp' });
      const audit = await db.prisma.auditLog.findMany({
        where: {
          action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
          targetId: account.documentId,
        },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: null,
        actorType: 'system',
        subject: 'accounts',
        ip: null,
        metadata: { previousMethod: 'totp' },
      });

      const after = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(after).toMatchObject({
        is2faEnabled: false,
        twoFaMethod: null,
        totpSecretEnc: null,
        totpSecretKid: null,
        totpLastStep: null,
        tokenVersion: before.tokenVersion + 1,
      });
      expect(await liveRefreshTokens(account.id)).toBe(0);
      expect((await me(accessToken)).status).toBe(HttpStatus.UNAUTHORIZED);

      // A temp token issued before the reset is dead too.
      const verify = await post(VERIFY).send({ tempToken, code: '000000' });
      expect(verify.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(errorCodeOf(verify)).toBe(AUTH_ERROR_CODES.INVALID_TEMP_TOKEN);

      // The password alone signs in again.
      expect((await me(await signIn(account.email))).status).toBe(
        HttpStatus.OK,
      );
    });

    it('works for the owner and for email 2FA', async () => {
      const owner = await db.prisma.account.create({
        data: {
          email: 'tf-owner@example.test',
          displayName: 'Owner',
          passwordHash: await hashPassword(PASSWORD),
          status: 'active',
          role: { connect: { slug: 'owner' } },
        },
        select: { id: true, documentId: true, email: true },
      });
      await withEmail2fa(owner);

      await expect(resetTwoFactor(db.prisma, owner.email)).resolves.toEqual({
        email: owner.email,
        previousMethod: 'email',
      });
      expect(await liveRefreshTokens(owner.id)).toBe(0);
    });

    it('refuses an unknown or deleted account', async () => {
      await expect(
        resetTwoFactor(db.prisma, 'nobody@example.test'),
      ).rejects.toMatchObject({
        code: TWO_FACTOR_RESET_ERRORS.ACCOUNT_NOT_FOUND,
      });

      const account = await createAccount();
      await withTotp(account);
      await db.prisma.account.update({
        where: { id: account.id },
        data: { deletedAt: new Date() },
      });
      await expect(
        resetTwoFactor(db.prisma, account.email),
      ).rejects.toMatchObject({
        code: TWO_FACTOR_RESET_ERRORS.ACCOUNT_NOT_FOUND,
      });
    });

    it('refuses an account with 2FA off and changes nothing', async () => {
      const account = await createAccount();
      await signIn(account.email);
      const before = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });

      await expect(
        resetTwoFactor(db.prisma, account.email),
      ).rejects.toMatchObject({ code: TWO_FACTOR_RESET_ERRORS.NOT_ENABLED });

      const after = await db.prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(after.tokenVersion).toBe(before.tokenVersion);
      expect(await liveRefreshTokens(account.id)).toBe(1);
    });
  });

  describe('rate limits', () => {
    it('throttles the 6th setup/enable/disable per IP within 15 minutes', async () => {
      const [rule] = IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_MANAGE;
      const ip = nextIp();
      const paths = [SETUP, ENABLE, DISABLE];
      for (let i = 0; i < rule.maxHits; i += 1) {
        await post(paths[i % paths.length] ?? SETUP, ip).send({});
      }
      const res = await post(SETUP, ip).send({});
      expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(errorCodeOf(res)).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
    });

    it('throttles the 6th email challenge per IP within 15 minutes', async () => {
      const [rule] = IDENTITY_RATE_LIMIT_POLICIES.TWO_FACTOR_EMAIL_CHALLENGE;
      const ip = nextIp();
      for (let i = 0; i < rule.maxHits; i += 1) {
        await post(EMAIL_CHALLENGE, ip).send({});
      }
      const res = await post(SEND_CODE, ip).send({});
      expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });
});

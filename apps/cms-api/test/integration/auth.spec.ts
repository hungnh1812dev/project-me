import { performance } from 'node:perf_hooks';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { decode, sign } from 'jsonwebtoken';
import request from 'supertest';

import { Clock } from '../../src/common/time/clock';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_ERROR_CODES,
  REFRESH_TOKEN_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_SECONDS,
  TOKEN_TYPES,
} from '../../src/modules/identity/domain/Identity.constants';
import { REFRESH_COOKIE } from '../../src/modules/identity/http/IdentityHttp.constants';
import { RATE_LIMIT_SWEEP_INTERVAL_MS } from '../../src/common/constants/limits.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { hashRefreshToken } from '../../src/modules/identity/application/RefreshToken.service';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
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

const AUTH = '/api/v1/auth';
const LOGIN = `${AUTH}/login`;
const REFRESH = `${AUTH}/refresh`;
const LOGOUT = `${AUTH}/logout`;
const ME = `${AUTH}/me`;
const PASSWORD = 'correct horse battery staple';
const WRONG_PASSWORD = 'incorrect horse battery staple';
const EVIL_ORIGIN = 'https://evil.example.test';
const OTHER_SECRET = 'another-secret-value-0123456789abcdef';
const TIMING_SAMPLES = 5;
/** Unknown-email logins must take at least / at most this share of a wrong-password login. */
const TIMING_RATIO = { min: 0.5, max: 2 };

type Account = { id: number; documentId: string; email: string };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function setCookies(res: request.Response): string[] {
  const raw: unknown = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw.map(String);
  return typeof raw === 'string' ? [raw] : [];
}

function refreshCookieHeader(res: request.Response): string {
  const header = setCookies(res).find((c) =>
    c.startsWith(`${REFRESH_COOKIE.NAME}=`),
  );
  if (header === undefined) throw new Error('no refresh cookie set');
  return header;
}

function refreshTokenOf(res: request.Response): string {
  const pair = refreshCookieHeader(res).split(';')[0] ?? '';
  return pair.slice(REFRESH_COOKIE.NAME.length + 1);
}

function hasRefreshCookie(res: request.Response): boolean {
  return setCookies(res).some((c) => c.startsWith(`${REFRESH_COOKIE.NAME}=`));
}

function cookie(token: string): string {
  return `${REFRESH_COOKIE.NAME}=${token}`;
}

function attributesOf(setCookie: string): string[] {
  return setCookie
    .split(';')
    .slice(1)
    .map((part) => part.trim().split('=')[0]?.toLowerCase() ?? '');
}

/** The unified error body without its per-request id. */
function errorBody(res: request.Response): unknown {
  const { requestId, ...rest } = res.body as Record<string, unknown>;
  expect(typeof requestId).toBe('string');
  return rest;
}

describe('auth: login, JWT, refresh rotation, logout (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let accountCount = 0;
  let clockSpy: jest.SpyInstance<number, []>;
  let jumpingNow: () => number;

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
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
      }),
    );
    // This suite tests auth, not throttling (rate-limit.spec.ts): every
    // rate-limit lookup lands in a fresh window.
    let fakeNow = Date.now();
    jumpingNow = () => (fakeNow += RATE_LIMIT_SWEEP_INTERVAL_MS);
    clockSpy = jest.spyOn(app.get(Clock), 'now').mockImplementation(jumpingNow);
  });

  afterEach(() => {
    clockSpy.mockImplementation(jumpingNow);
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());

  async function createAccount(
    overrides: {
      status?: 'invited' | 'active' | 'disabled';
      deleted?: boolean;
      withPassword?: boolean;
      twoFa?: 'totp' | 'email';
    } = {},
  ): Promise<Account> {
    accountCount += 1;
    const email = `user${accountCount}@example.test`;
    return db.prisma.account.create({
      data: {
        email,
        displayName: `User ${accountCount}`,
        passwordHash:
          overrides.withPassword === false
            ? null
            : await hashPassword(PASSWORD),
        status: overrides.status ?? 'active',
        deletedAt: overrides.deleted === true ? new Date() : null,
        is2faEnabled: overrides.twoFa !== undefined,
        twoFaMethod: overrides.twoFa ?? null,
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  function login(email: string, password = PASSWORD, path = LOGIN) {
    return http().post(path).send({ email, password });
  }

  async function signIn(account: Account) {
    const res = await login(account.email);
    expect(res.status).toBe(200);
    return {
      accessToken: (res.body as { accessToken: string }).accessToken,
      refreshToken: refreshTokenOf(res),
    };
  }

  /** Moves a rotated token's rotation time `ms` into the past. */
  async function rotatedAgo(token: string, ms: number): Promise<void> {
    await db.prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(token) },
      data: { revokedAt: new Date(Date.now() - ms) },
    });
  }

  /**
   * Refresh-token times (grace window, reuse) come from `Clock`. These tests
   * set `revokedAt` relative to real time, so they read real time too until
   * the next test.
   */
  function useRealClock(): void {
    clockSpy.mockImplementation(() => Date.now());
  }

  function refresh(
    token: string | undefined,
    origin: string | null = TEST_ADMIN_ORIGIN,
  ) {
    const req = http().post(REFRESH);
    if (origin !== null) req.set('Origin', origin);
    if (token !== undefined) req.set('Cookie', cookie(token));
    return req;
  }

  function logout(
    token: string | undefined,
    origin: string | null = TEST_ADMIN_ORIGIN,
  ) {
    const req = http().post(LOGOUT);
    if (origin !== null) req.set('Origin', origin);
    if (token !== undefined) req.set('Cookie', cookie(token));
    return req;
  }

  function tokenRow(token: string) {
    return db.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(token) },
    });
  }

  function tokenVersion(account: Account): Promise<number> {
    return db.prisma.account
      .findUniqueOrThrow({ where: { id: account.id } })
      .then((a) => a.tokenVersion);
  }

  describe('POST /auth/login', () => {
    it('returns the access token in the body and sets the §6 refresh cookie', async () => {
      const account = await createAccount();
      const res = await login(account.email);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body as object)).toEqual(['accessToken']);
      expect(res.headers['cache-control']).toBe('no-store');

      const setCookie = refreshCookieHeader(res);
      expect(setCookie).toContain(`; Path=${REFRESH_COOKIE.PATH}`);
      expect(setCookie).toContain(`; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`);
      expect(setCookie).toContain('; HttpOnly');
      expect(setCookie).toContain('; Secure');
      expect(setCookie).toContain('; SameSite=Strict');
      // Host-only: no Domain attribute at all.
      expect(attributesOf(setCookie)).not.toContain('domain');
      expect(attributesOf(setCookie).sort()).toEqual(
        ['expires', 'httponly', 'max-age', 'path', 'samesite', 'secure'].sort(),
      );
    });

    it('stores only the hash of the refresh token', async () => {
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const rows = await db.prisma.refreshToken.findMany({
        where: { accountId: account.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashRefreshToken(refreshToken));
      expect(rows[0]?.tokenHash).not.toContain(refreshToken);
      expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('signs an HS256 JWT with sub/tv/pv/kid', async () => {
      const account = await createAccount();
      const { accessToken } = await signIn(account);
      const decoded = decode(accessToken, { complete: true });
      expect(decoded?.header).toMatchObject({
        alg: 'HS256',
        kid: TEST_JWT_KID,
      });
      const payload = decoded?.payload as Record<string, number | string>;
      expect(payload).toMatchObject({
        sub: account.documentId,
        tv: 1,
        pv: 1,
        kid: TEST_JWT_KID,
        typ: TOKEN_TYPES.ACCESS,
      });
      expect(Number(payload['exp']) - Number(payload['iat'])).toBe(
        ACCESS_TOKEN_TTL_SECONDS,
      );
    });

    it('accepts a trailing slash without redirecting (SPEC §12-17)', async () => {
      const account = await createAccount();
      expect((await login(account.email, PASSWORD, `${LOGIN}/`)).status).toBe(
        200,
      );
      expect(
        (await login(account.email, WRONG_PASSWORD, `${LOGIN}/`)).status,
      ).toBe(401);
    });

    it('gives unknown email, wrong password and non-active accounts the identical error', async () => {
      const active = await createAccount();
      const invited = await createAccount({
        status: 'invited',
        withPassword: false,
      });
      const invitedWithHash = await createAccount({ status: 'invited' });
      const disabled = await createAccount({ status: 'disabled' });
      const deleted = await createAccount({ deleted: true });

      const responses = [
        await login('nobody@example.test'),
        await login(active.email, WRONG_PASSWORD),
        await login(invited.email),
        await login(invitedWithHash.email),
        await login(disabled.email),
        await login(deleted.email),
      ];
      const expected = {
        statusCode: 401,
        errorCode: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      };
      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(errorBody(res)).toEqual(expected);
        expect(setCookies(res)).toEqual([]);
      }
      expect(
        await db.prisma.refreshToken.count({
          where: { accountId: disabled.id },
        }),
      ).toBe(0);
    });

    it('takes similar time for an unknown email and a wrong password', async () => {
      const account = await createAccount();
      const time = async (email: string) => {
        const start = performance.now();
        await login(email, WRONG_PASSWORD);
        return performance.now() - start;
      };
      // Warm-up so connection setup doesn't count.
      await time(account.email);
      const unknown: number[] = [];
      const wrong: number[] = [];
      for (let i = 0; i < TIMING_SAMPLES; i += 1) {
        unknown.push(await time(`ghost${i}@example.test`));
        wrong.push(await time(account.email));
      }
      const ratio = median(unknown) / median(wrong);
      expect(ratio).toBeGreaterThan(TIMING_RATIO.min);
      expect(ratio).toBeLessThan(TIMING_RATIO.max);
    });

    it('rejects a malformed body with 400', async () => {
      const res = await http().post(LOGIN).send({ email: 'a@example.test' });
      expect(res.status).toBe(400);
      expect(errorBody(res)).toMatchObject({
        statusCode: 400,
        errorCode: AUTH_ERROR_CODES.INVALID_REQUEST,
      });
    });

    it('answers 2FA accounts with a temp token and no session', async () => {
      const account = await createAccount({ twoFa: 'totp' });
      const res = await login(account.email);
      expect(res.status).toBe(200);
      const body = res.body as {
        requires2FA: boolean;
        tempToken: string;
        methods: string[];
      };
      expect(body.requires2FA).toBe(true);
      expect(body.methods).toEqual(['totp']);
      expect(typeof body.tempToken).toBe('string');
      expect(setCookies(res)).toEqual([]);
      expect(
        await db.prisma.refreshToken.count({
          where: { accountId: account.id },
        }),
      ).toBe(0);

      // The temp token is not an access token.
      const me = await http()
        .get(ME)
        .set('Authorization', `Bearer ${body.tempToken}`);
      expect(me.status).toBe(401);
    });
  });

  describe('POST /auth/register', () => {
    it('does not exist (invite-only, SPEC §12-2)', async () => {
      const res = await http()
        .post(`${AUTH}/register`)
        .send({ email: 'new@example.test', password: PASSWORD });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the minimal profile for a valid access token', async () => {
      const account = await createAccount();
      const { accessToken } = await signIn(account);
      const res = await http()
        .get(ME)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: account.documentId,
        email: account.email,
        displayName: expect.any(String) as unknown,
        role: 'editor',
        twoFactorEnabled: false,
        twoFactorMethod: null,
        permissions: expect.any(Array) as unknown,
      });
    });

    it('requires a Bearer token and ignores the refresh cookie', async () => {
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const res = await http().get(ME).set('Cookie', cookie(refreshToken));
      expect(res.status).toBe(401);
      expect(errorBody(res)).toMatchObject({
        statusCode: 401,
        errorCode: 'UNAUTHORIZED',
      });
    });
  });

  describe('JWT algorithm pinning', () => {
    let account: Account;
    let claims: Record<string, unknown>;

    beforeAll(async () => {
      account = await createAccount();
      claims = {
        sub: account.documentId,
        tv: 1,
        pv: 1,
        kid: TEST_JWT_KID,
        typ: TOKEN_TYPES.ACCESS,
      };
    });

    const me = (token: string) =>
      http().get(ME).set('Authorization', `Bearer ${token}`);

    it('accepts a correctly signed HS256 token', async () => {
      const token = sign(claims, TEST_SECRET_32_BYTES, {
        algorithm: 'HS256',
        keyid: TEST_JWT_KID,
      });
      expect((await me(token)).status).toBe(200);
    });

    it.each(['HS384', 'HS512'] as const)(
      'rejects %s even with the right secret',
      async (alg) => {
        const token = sign(claims, TEST_SECRET_32_BYTES, {
          algorithm: alg,
          keyid: TEST_JWT_KID,
        });
        expect((await me(token)).status).toBe(401);
      },
    );

    it('rejects alg none', async () => {
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'none', typ: 'JWT', kid: TEST_JWT_KID })}.${encode(
        {
          ...claims,
          exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
        },
      )}.`;
      expect((await me(token)).status).toBe(401);
    });

    it('rejects a wrong secret, an unknown kid and a kid claim that differs from the header', async () => {
      const wrongSecret = sign(claims, OTHER_SECRET, {
        algorithm: 'HS256',
        keyid: TEST_JWT_KID,
      });
      const unknownKid = sign(
        { ...claims, kid: 'other' },
        TEST_SECRET_32_BYTES,
        {
          algorithm: 'HS256',
          keyid: 'other',
        },
      );
      const mismatched = sign(
        { ...claims, kid: 'other' },
        TEST_SECRET_32_BYTES,
        {
          algorithm: 'HS256',
          keyid: TEST_JWT_KID,
        },
      );
      const noKid = sign(claims, TEST_SECRET_32_BYTES, { algorithm: 'HS256' });
      for (const token of [wrongSecret, unknownKid, mismatched, noKid]) {
        expect((await me(token)).status).toBe(401);
      }
    });

    it('rejects expired tokens and tokens missing D9 claims', async () => {
      const expired = sign(claims, TEST_SECRET_32_BYTES, {
        algorithm: 'HS256',
        keyid: TEST_JWT_KID,
        expiresIn: -1,
      });
      const withoutTv = { ...claims };
      delete withoutTv['tv'];
      const missingTv = sign(withoutTv, TEST_SECRET_32_BYTES, {
        algorithm: 'HS256',
        keyid: TEST_JWT_KID,
      });
      expect((await me(expired)).status).toBe(401);
      expect((await me(missingTv)).status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the token within the family and returns a new access token', async () => {
      const account = await createAccount();
      const first = await signIn(account);

      const res = await refresh(first.refreshToken, TEST_WEB_ORIGIN);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body as object)).toEqual(['accessToken']);
      expect(res.headers['cache-control']).toBe('no-store');
      const nextToken = refreshTokenOf(res);
      expect(nextToken).not.toBe(first.refreshToken);
      expect(refreshCookieHeader(res)).toContain(
        `; Path=${REFRESH_COOKIE.PATH}`,
      );

      const oldRow = await tokenRow(first.refreshToken);
      const newRow = await tokenRow(nextToken);
      expect(newRow.familyId).toBe(oldRow.familyId);
      expect(oldRow.replacedById).toBe(newRow.id);
      expect(oldRow.revokedAt).not.toBeNull();
      expect(newRow.revokedAt).toBeNull();

      const me = await http()
        .get(ME)
        .set(
          'Authorization',
          `Bearer ${(res.body as { accessToken: string }).accessToken}`,
        );
      expect(me.status).toBe(200);

      // And again from the admin origin.
      expect((await refresh(nextToken, TEST_ADMIN_ORIGIN)).status).toBe(200);
    });

    it('treats reuse of a rotated token after the grace window as theft: revokes the family and bumps token_version', async () => {
      useRealClock();
      const account = await createAccount();
      const otherSession = await signIn(account);
      const stolen = await signIn(account);
      const rotated = refreshTokenOf(await refresh(stolen.refreshToken));
      await rotatedAgo(stolen.refreshToken, REFRESH_TOKEN_REUSE_GRACE_MS + 1);
      const versionBefore = await tokenVersion(account);

      const reuse = await refresh(stolen.refreshToken);
      expect(reuse.status).toBe(401);
      expect(errorBody(reuse)).toMatchObject({
        errorCode: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
      });
      expect(refreshCookieHeader(reuse)).toMatch(/Expires=Thu, 01 Jan 1970/);

      const family = await db.prisma.refreshToken.findMany({
        where: { familyId: (await tokenRow(stolen.refreshToken)).familyId },
      });
      expect(family.length).toBeGreaterThanOrEqual(2);
      expect(family.every((row) => row.revokedAt !== null)).toBe(true);
      expect(await tokenVersion(account)).toBe(versionBefore + 1);

      // The legitimately rotated token is dead too; another family is untouched.
      expect((await refresh(rotated)).status).toBe(401);
      expect((await tokenRow(otherSession.refreshToken)).revokedAt).toBeNull();
    });

    it('serves two concurrent refreshes with one token without revoking the family (T11a)', async () => {
      useRealClock();
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const versionBefore = await tokenVersion(account);
      const results = await Promise.all([
        refresh(refreshToken),
        refresh(refreshToken),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      // One rotation: only the winner sets a new cookie.
      const rotated = results.filter(hasRefreshCookie);
      expect(rotated).toHaveLength(1);
      const successor = refreshTokenOf(rotated[0] as request.Response);

      const family = await db.prisma.refreshToken.findMany({
        where: { familyId: (await tokenRow(refreshToken)).familyId },
      });
      expect(family).toHaveLength(2);
      expect((await tokenRow(successor)).revokedAt).toBeNull();
      expect(await tokenVersion(account)).toBe(versionBefore);
      for (const res of results) {
        const { accessToken } = res.body as { accessToken: string };
        const me = await http()
          .get(ME)
          .set('Authorization', `Bearer ${accessToken}`);
        expect(me.status).toBe(200);
      }
      expect((await refresh(successor)).status).toBe(200);
    });

    it('answers a late refresh inside the grace window with an access token only', async () => {
      useRealClock();
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const successor = refreshTokenOf(await refresh(refreshToken));
      await rotatedAgo(refreshToken, REFRESH_TOKEN_REUSE_GRACE_MS - 1_000);

      const late = await refresh(refreshToken);
      expect(late.status).toBe(200);
      expect(hasRefreshCookie(late)).toBe(false);
      expect(
        (
          await http()
            .get(ME)
            .set(
              'Authorization',
              `Bearer ${(late.body as { accessToken: string }).accessToken}`,
            )
        ).status,
      ).toBe(200);
      expect((await tokenRow(successor)).revokedAt).toBeNull();
      expect((await refresh(successor)).status).toBe(200);
    });

    it('treats a rotated token as reuse once its successor was used, even inside the window', async () => {
      useRealClock();
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const successor = refreshTokenOf(await refresh(refreshToken));
      const third = refreshTokenOf(await refresh(successor));
      const versionBefore = await tokenVersion(account);

      expect((await refresh(refreshToken)).status).toBe(401);
      expect((await tokenRow(third)).revokedAt).not.toBeNull();
      expect(await tokenVersion(account)).toBe(versionBefore + 1);
    });

    it('treats a rotated token as reuse after logout, even inside the window', async () => {
      useRealClock();
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const successor = refreshTokenOf(await refresh(refreshToken));
      await http()
        .post(LOGOUT)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', cookie(successor));
      const versionBefore = await tokenVersion(account);

      expect((await refresh(refreshToken)).status).toBe(401);
      expect(await tokenVersion(account)).toBe(versionBefore + 1);
    });

    it.each([
      ['a missing Origin', null],
      ['a foreign Origin', EVIL_ORIGIN],
      ['the literal "null" Origin', 'null'],
    ])(
      'refuses %s with 403 and leaves the token usable',
      async (_label, origin) => {
        const account = await createAccount();
        const { refreshToken } = await signIn(account);
        const res = await refresh(refreshToken, origin);
        expect(res.status).toBe(403);
        expect(errorBody(res)).toEqual({
          statusCode: 403,
          errorCode: AUTH_ERROR_CODES.ORIGIN_NOT_ALLOWED,
          message: 'Request origin is not allowed',
        });
        expect((await tokenRow(refreshToken)).revokedAt).toBeNull();
        expect((await refresh(refreshToken)).status).toBe(200);
      },
    );

    it('refuses a missing, unknown or expired cookie and a disabled account', async () => {
      expect((await refresh(undefined)).status).toBe(401);
      expect((await refresh('not-a-real-token')).status).toBe(401);

      const account = await createAccount();
      const expired = await signIn(account);
      await db.prisma.refreshToken.update({
        where: { tokenHash: hashRefreshToken(expired.refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      expect((await refresh(expired.refreshToken)).status).toBe(401);

      const disabled = await signIn(account);
      await db.prisma.account.update({
        where: { id: account.id },
        data: { status: 'disabled' },
      });
      expect((await refresh(disabled.refreshToken)).status).toBe(401);
      expect((await tokenRow(disabled.refreshToken)).revokedAt).not.toBeNull();
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the family and clears the cookie', async () => {
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      const rotated = refreshTokenOf(await refresh(refreshToken));

      const res = await logout(rotated, TEST_WEB_ORIGIN);
      expect(res.status).toBe(204);
      const cleared = refreshCookieHeader(res);
      expect(cleared).toMatch(/^__Secure-abyss_rt=;/);
      expect(cleared).toContain(`; Path=${REFRESH_COOKIE.PATH}`);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(attributesOf(cleared)).not.toContain('domain');

      const family = await db.prisma.refreshToken.findMany({
        where: { familyId: (await tokenRow(rotated)).familyId },
      });
      expect(family.every((row) => row.revokedAt !== null)).toBe(true);
      expect((await refresh(rotated)).status).toBe(401);
    });

    it('is idempotent without a cookie', async () => {
      expect((await logout(undefined)).status).toBe(204);
    });

    it('refuses a missing or foreign Origin with 403', async () => {
      const account = await createAccount();
      const { refreshToken } = await signIn(account);
      for (const origin of [null, EVIL_ORIGIN]) {
        const res = await logout(refreshToken, origin);
        expect(res.status).toBe(403);
        expect(errorBody(res)).toMatchObject({
          errorCode: AUTH_ERROR_CODES.ORIGIN_NOT_ALLOWED,
        });
      }
      expect((await tokenRow(refreshToken)).revokedAt).toBeNull();
    });
  });

  describe('CORS stays admin-only', () => {
    it('does not allow the web origin cross-origin', async () => {
      const res = await http()
        .options(REFRESH)
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

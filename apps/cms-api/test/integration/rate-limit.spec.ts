import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { Clock } from '../../src/common/time/clock';
import { MS_PER_SECOND } from '../../src/common/constants/time.constants';
import { RATE_LIMIT_STORE_MAX_KEYS } from '../../src/common/rate-limit/rate-limit.store';
import { ERROR_CODES } from '../../src/common/constants/error.constants';
import {
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
} from '../../src/common/constants/limits.constants';
import { IDENTITY_RATE_LIMIT_POLICIES } from '../../src/modules/identity/http/IdentityHttp.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
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
import { createTestApp, type ProviderOverride } from '../fixtures/test-app';

const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const PASSWORD = 'correct horse battery staple';
const WRONG_PASSWORD = 'incorrect horse battery staple';
const CF_HEADER = 'cf-connecting-ip';
const START = 1_700_000_000_000;

const [LOGIN_IP, LOGIN_EMAIL] = IDENTITY_RATE_LIMIT_POLICIES.LOGIN;
const [REFRESH_IP] = IDENTITY_RATE_LIMIT_POLICIES.REFRESH;

let ipCounter = 0;
const OCTET_RANGE = 250;
/** A fresh private address per call. */
function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

let spoofCounter = 0;
/** A different forged address each time, as an attacker would rotate it. */
function spoofedIp(): string {
  spoofCounter += 1;
  return `198.51.100.${(spoofCounter % OCTET_RANGE) + 1}`;
}

let emailCounter = 0;
function unknownEmail(): string {
  emailCounter += 1;
  return `ghost${emailCounter}@example.test`;
}

function seconds(ms: number): number {
  return ms / MS_PER_SECOND;
}

/** The unified error body without its per-request id. */
function errorBody(res: request.Response): unknown {
  const { requestId, ...rest } = res.body as Record<string, unknown>;
  expect(typeof requestId).toBe('string');
  return rest;
}

const TOO_MANY = {
  statusCode: 429,
  errorCode: ERROR_CODES.TOO_MANY_REQUESTS,
  message: RATE_LIMIT_MESSAGE,
};

describe('rate limiting + client IP (D7, SPEC §12-8; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let databaseUrl: string;
  let db: PrismaHandle;
  let knownEmail: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    knownEmail = 'known@example.test';
    await db.prisma.account.create({
      data: {
        email: knownEmail,
        displayName: 'Known',
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
    });
  });

  afterAll(async () => {
    await db?.close();
    await postgres?.stop();
  });

  async function startApp(
    overrides: Record<string, string> = {},
    providers: readonly ProviderOverride[] = [],
  ) {
    const app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
        ...overrides,
      }),
      providers,
    );
    const time = { now: START };
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => time.now);
    return { app, time };
  }

  describe('with login limit overrides (T18b)', () => {
    const OVERRIDE_IP = LOGIN_IP.maxHits + 3;
    const OVERRIDE_EMAIL = LOGIN_EMAIL.maxHits + 3;
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await startApp({
        LOGIN_RATE_LIMIT_IP: String(OVERRIDE_IP),
        LOGIN_RATE_LIMIT_EMAIL: String(OVERRIDE_EMAIL),
      }));
    });

    afterAll(async () => {
      await app?.close();
    });

    function login(clientIp: string, email: string) {
      return request(app.getHttpServer())
        .post(LOGIN)
        .set('X-Forwarded-For', clientIp)
        .send({ email, password: WRONG_PASSWORD });
    }

    it('applies the IP override instead of the default', async () => {
      const ip = nextIp();
      for (let i = 0; i < OVERRIDE_IP; i += 1) {
        expect((await login(ip, unknownEmail())).status).toBe(401);
      }
      expect((await login(ip, unknownEmail())).status).toBe(429);
    });

    it('applies the email override instead of the default', async () => {
      const email = unknownEmail();
      for (let i = 0; i < OVERRIDE_EMAIL; i += 1) {
        expect((await login(nextIp(), email)).status).toBe(401);
      }
      expect((await login(nextIp(), email)).status).toBe(429);
    });
  });

  describe('with X-Forwarded-For and TRUST_PROXY_HOPS=1', () => {
    let app: NestExpressApplication;
    let time: { now: number };

    beforeAll(async () => {
      ({ app, time } = await startApp());
    });

    afterAll(async () => {
      await app?.close();
    });

    // Every test starts with all windows expired.
    beforeEach(() => {
      time.now += RATE_LIMIT_SWEEP_INTERVAL_MS;
    });

    /**
     * A request as the proxy forwards it: the client may send any XFF; the
     * one trusted hop appends the real peer address last.
     */
    function login(
      clientIp: string,
      email: string,
      password = WRONG_PASSWORD,
      forged: string = spoofedIp(),
    ) {
      return request(app.getHttpServer())
        .post(LOGIN)
        .set('X-Forwarded-For', `${forged}, ${clientIp}`)
        .send({ email, password });
    }

    it('keys the IP limit on the real client, whatever XFF it forges (§12-8)', async () => {
      const attacker = nextIp();
      for (let i = 0; i < LOGIN_IP.maxHits; i += 1) {
        expect((await login(attacker, unknownEmail())).status).toBe(401);
      }
      const blocked = await login(attacker, unknownEmail());
      expect(blocked.status).toBe(429);
      expect(errorBody(blocked)).toEqual(TOO_MANY);
      expect(blocked.headers['retry-after']).toBe(
        String(seconds(LOGIN_IP.windowMs)),
      );

      // Another real client is unaffected, and poisoning its address via XFF
      // from the attacker did nothing.
      const victim = nextIp();
      expect(
        (await login(victim, unknownEmail(), WRONG_PASSWORD, attacker)).status,
      ).toBe(401);
      expect(
        (await login(attacker, unknownEmail(), WRONG_PASSWORD, victim)).status,
      ).toBe(429);
    });

    it('limits per email across IPs, case- and whitespace-insensitively', async () => {
      const email = unknownEmail();
      const spellings = [email, email.toUpperCase(), ` ${email} `];
      for (let i = 0; i < LOGIN_EMAIL.maxHits; i += 1) {
        const spelling = spellings[i % spellings.length] ?? email;
        expect((await login(nextIp(), spelling)).status).toBe(401);
      }
      const blocked = await login(nextIp(), email.toUpperCase());
      expect(blocked.status).toBe(429);
      expect(errorBody(blocked)).toEqual(TOO_MANY);
      expect(blocked.headers['retry-after']).toBe(
        String(seconds(LOGIN_EMAIL.windowMs)),
      );
    });

    it('keeps the IP and email counters independent', async () => {
      // Exhaust one IP with fresh emails: those emails stay usable elsewhere.
      const busyIp = nextIp();
      const emails = Array.from({ length: LOGIN_IP.maxHits }, unknownEmail);
      for (const email of emails) {
        expect((await login(busyIp, email)).status).toBe(401);
      }
      expect((await login(busyIp, unknownEmail())).status).toBe(429);
      expect((await login(nextIp(), emails[0] ?? '')).status).toBe(401);

      // Exhaust one email from many IPs: those IPs stay usable for others.
      const target = unknownEmail();
      const ips = Array.from({ length: LOGIN_EMAIL.maxHits }, nextIp);
      for (const ip of ips) {
        expect((await login(ip, target)).status).toBe(401);
      }
      expect((await login(nextIp(), target)).status).toBe(429);
      expect((await login(ips[0] ?? '', unknownEmail())).status).toBe(401);
    });

    it('counts down Retry-After and resets after the window', async () => {
      const ip = nextIp();
      for (let i = 0; i < LOGIN_IP.maxHits; i += 1) {
        await login(ip, unknownEmail());
      }
      const elapsedMs = LOGIN_IP.windowMs / 3;
      time.now += elapsedMs;
      const blocked = await login(ip, unknownEmail());
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBe(
        String(seconds(LOGIN_IP.windowMs - elapsedMs)),
      );

      time.now += LOGIN_IP.windowMs - elapsedMs;
      expect((await login(ip, unknownEmail())).status).toBe(401);
    });

    it('throttles a known and an unknown email identically', async () => {
      const run = async (email: string) => {
        const results: unknown[] = [];
        for (let i = 0; i <= LOGIN_EMAIL.maxHits; i += 1) {
          const res = await login(nextIp(), email);
          results.push({
            body: errorBody(res),
            retryAfter: res.headers['retry-after'],
          });
        }
        return results;
      };
      const known = await run(knownEmail);
      const unknown = await run(unknownEmail());
      expect(known).toEqual(unknown);
      expect(known.at(-1)).toEqual({
        body: TOO_MANY,
        retryAfter: String(seconds(LOGIN_EMAIL.windowMs)),
      });
    });

    it('blocks a correct password too once the email limit is used up', async () => {
      for (let i = 0; i < LOGIN_EMAIL.maxHits; i += 1) {
        await login(nextIp(), knownEmail);
      }
      expect((await login(nextIp(), knownEmail, PASSWORD)).status).toBe(429);
      time.now += LOGIN_EMAIL.windowMs;
      expect((await login(nextIp(), knownEmail, PASSWORD)).status).toBe(200);
    });

    it('throttles refresh per IP before the Origin check', async () => {
      const ip = nextIp();
      const refresh = () =>
        request(app.getHttpServer())
          .post(REFRESH)
          .set('X-Forwarded-For', `${spoofedIp()}, ${ip}`);
      for (let i = 0; i < REFRESH_IP.maxHits; i += 1) {
        expect((await refresh()).status).toBe(403);
      }
      const blocked = await refresh();
      expect(blocked.status).toBe(429);
      expect(errorBody(blocked)).toEqual(TOO_MANY);
      expect(blocked.headers['retry-after']).toBe(
        String(seconds(REFRESH_IP.windowMs)),
      );
    });
  });

  describe('with CLIENT_IP_HEADER=cf-connecting-ip', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await startApp({ CLIENT_IP_HEADER: CF_HEADER }));
    });

    afterAll(async () => {
      await app?.close();
    });

    function login(cfIp: string) {
      return request(app.getHttpServer())
        .post(LOGIN)
        .set(CF_HEADER, cfIp)
        .set('X-Forwarded-For', `${spoofedIp()}, ${nextIp()}`)
        .send({ email: unknownEmail(), password: WRONG_PASSWORD });
    }

    it('keys on the configured header and ignores X-Forwarded-For', async () => {
      const client = nextIp();
      for (let i = 0; i < LOGIN_IP.maxHits; i += 1) {
        expect((await login(client)).status).toBe(401);
      }
      expect((await login(client)).status).toBe(429);
      expect((await login(nextIp())).status).toBe(401);
    });
  });

  describe('with the store at its max-keys cap (T10a)', () => {
    /** One login from a new IP and a new email takes two keys. */
    const CAP = 4;
    let app: NestExpressApplication;
    let time: { now: number };

    beforeAll(async () => {
      ({ app, time } = await startApp({}, [
        { token: RATE_LIMIT_STORE_MAX_KEYS, value: CAP },
      ]));
    });

    afterAll(async () => {
      await app?.close();
    });

    function login(clientIp: string, email: string) {
      return request(app.getHttpServer())
        .post(LOGIN)
        .set('X-Forwarded-For', clientIp)
        .send({ email, password: WRONG_PASSWORD });
    }

    it('answers 429 like a limit hit for new clients; known clients keep working', async () => {
      const known = [
        { ip: nextIp(), email: unknownEmail() },
        { ip: nextIp(), email: unknownEmail() },
      ];
      for (const { ip, email } of known) {
        expect((await login(ip, email)).status).toBe(401);
      }

      const refused = await login(nextIp(), unknownEmail());
      expect(refused.status).toBe(429);
      expect(errorBody(refused)).toEqual(TOO_MANY);
      expect(refused.headers['retry-after']).toBe(
        String(seconds(LOGIN_IP.windowMs)),
      );

      const first = known[0];
      expect(first).toBeDefined();
      expect((await login(first?.ip ?? '', first?.email ?? '')).status).toBe(
        401,
      );

      // Once the counters expire, the sweep frees room for new clients.
      time.now += LOGIN_IP.windowMs;
      expect((await login(nextIp(), unknownEmail())).status).toBe(401);
    });
  });
});

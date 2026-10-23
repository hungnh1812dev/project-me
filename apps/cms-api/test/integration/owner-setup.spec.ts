import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { IDENTITY_RATE_LIMIT_POLICIES } from '../../src/modules/identity/identity.rate-limits.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { AUDIT_ACTIONS } from '../../src/modules/security-audit/security-audit.constants';
import { OWNER_ROLE_SLUG } from '../../src/modules/access/roles/system-roles';
import { OWNER_BOOTSTRAP_ERRORS } from '../../src/modules/identity/identity.constants';
import {
  bootstrapOwner,
  OwnerBootstrapError,
} from '../../src/modules/identity/owner-bootstrap';
import { hashPassword } from '../../src/modules/identity/password-hasher';
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

const STATUS = '/api/v1/setup/status';
const OWNER = '/api/v1/setup/owner';
const LOGIN = '/api/v1/auth/login';
const TOKEN = 'integration-setup-token-0123456789abcdef';
const PASSWORD = 'correct horse battery staple';
const CONCURRENT_SUBMITS = 5;
const OCTET_RANGE = 250;
const SUBMIT_LIMIT = IDENTITY_RATE_LIMIT_POLICIES.SETUP_SUBMIT[0].limit;
const STATUS_LIMIT = IDENTITY_RATE_LIMIT_POLICIES.SETUP_STATUS[0].limit;

let ipCounter = 0;
/** A fresh client address per call, so throttles never leak between tests. */
function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    setupToken: TOKEN,
    email: 'owner@example.test',
    displayName: 'The Owner',
    password: PASSWORD,
    ...overrides,
  };
}

/** The error body without its per-request id. */
function errorBody(res: request.Response): Record<string, unknown> {
  const { requestId, ...rest } = res.body as Record<string, unknown>;
  expect(typeof requestId).toBe('string');
  return rest;
}

describe('owner setup (ADR 0005; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let template: Awaited<ReturnType<typeof createCoreTemplate>>;
  const apps: NestExpressApplication[] = [];
  const handles: PrismaHandle[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    template = await createCoreTemplate(postgres.getConnectionUri());
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await Promise.all(handles.map((handle) => handle.close()));
    await postgres?.stop();
  });

  /** Fresh migrated + seeded database and an app on it. */
  async function launch(env: Record<string, string | undefined> = {}) {
    const url = await template.fresh();
    const db = openPrisma(url);
    handles.push(db);
    await seedSystemRoles(db.prisma);
    const app = await createTestApp(
      devEnv({
        ...dbEnvOf(url),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
        OWNER_SETUP_TOKEN: TOKEN,
        ...env,
      }),
    );
    apps.push(app);
    const post = (payload: unknown, ip = nextIp()) =>
      request(app.getHttpServer())
        .post(OWNER)
        .set('X-Forwarded-For', ip)
        .send(payload as object);
    const status = (ip = nextIp()) =>
      request(app.getHttpServer()).get(STATUS).set('X-Forwarded-For', ip);
    return { app, db, post, status, url };
  }

  const ownerRows = (db: PrismaHandle) =>
    db.prisma.account.findMany({
      where: { roleSlug: OWNER_ROLE_SLUG, deletedAt: null },
    });

  describe('GET /setup/status', () => {
    it('is closed when no token is configured', async () => {
      const { status } = await launch({ OWNER_SETUP_TOKEN: undefined });
      const res = await status();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ open: false });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is open with a token and no owner, needing no credentials', async () => {
      const { status } = await launch();
      const res = await status();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ open: true });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is closed once an owner exists, whatever the token', async () => {
      const { db, status } = await launch();
      await bootstrapOwner(db.prisma, {
        email: 'cli@example.test',
        password: PASSWORD,
      });
      expect((await status()).body).toEqual({ open: false });
    });

    it('answers 429 after its per-IP limit', async () => {
      const { status } = await launch();
      const ip = nextIp();
      for (let i = 0; i < STATUS_LIMIT; i += 1) {
        expect((await status(ip)).status).toBe(200);
      }
      expect((await status(ip)).status).toBe(429);
    });
  });

  describe('POST /setup/owner', () => {
    it('answers exactly like an unknown route when no token is configured', async () => {
      const { app, post, db } = await launch({ OWNER_SETUP_TOKEN: undefined });
      const res = await post(body());
      const unknown = await request(app.getHttpServer()).post(
        '/api/v1/setup/nothing',
      );
      expect(res.status).toBe(404);
      expect(errorBody(res)).toEqual({
        ...errorBody(unknown),
        message: 'Cannot POST /api/v1/setup/owner',
      });
      expect(errorBody(res)).toMatchObject({ errorCode: 'NOT_FOUND' });
      expect(await ownerRows(db)).toHaveLength(0);
    });

    it('rejects a wrong token with 401, an audit row, and no account', async () => {
      const { post, db } = await launch();
      const ip = nextIp();
      const res = await post(body({ setupToken: 'wrong-token' }), ip);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ errorCode: 'SETUP_TOKEN_INVALID' });
      expect(await ownerRows(db)).toHaveLength(0);

      const rows = await db.prisma.auditLog.findMany({
        where: { action: AUDIT_ACTIONS.OWNER_SETUP_REJECTED },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: null,
        metadata: { reason: 'bad_token' },
        ip,
      });
      const text = JSON.stringify(rows.map((row) => [row.metadata, row.ip]));
      expect(text).not.toContain('wrong-token');
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain('owner@example.test');
      expect(text).not.toContain(PASSWORD);
    });

    it('checks the token before the body: a wrong token with a bad body is 401, not 400', async () => {
      const { post } = await launch();
      const res = await post({ setupToken: 'nope', email: 5, password: 1 });
      expect(res.status).toBe(401);
    });

    it('treats a missing, numeric or over-long token as wrong (401)', async () => {
      const { post } = await launch();
      expect((await post({ ...body(), setupToken: undefined })).status).toBe(
        401,
      );
      expect((await post(body({ setupToken: 12345 }))).status).toBe(401);
      expect((await post(body({ setupToken: 'x'.repeat(5_000) }))).status).toBe(
        401,
      );
    });

    it('names fields only on 400, with the right token', async () => {
      const { post, db } = await launch();
      const res = await post(
        body({ email: 'not-an-email', password: 'short' }),
      );
      expect(res.status).toBe(400);
      const text = JSON.stringify(res.body);
      expect(text).toContain('email');
      expect(text).toContain('password');
      expect(text).not.toContain('not-an-email');
      expect(text).not.toContain(TOKEN);
      expect(await ownerRows(db)).toHaveLength(0);
    });

    it('rejects a display name over 100 characters with 400', async () => {
      const { post, db } = await launch();
      const res = await post(body({ displayName: 'n'.repeat(101) }));
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('displayName');
      expect(await ownerRows(db)).toHaveLength(0);
    });

    it('creates the owner: 201 { email }, no cookie, no token, audit row', async () => {
      const { post, db, status } = await launch();
      const ip = nextIp();
      const res = await post(body({ email: ' Owner@Example.test ' }), ip);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ email: 'owner@example.test' });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);

      const owners = await ownerRows(db);
      expect(owners).toHaveLength(1);
      expect(owners[0]).toMatchObject({
        email: 'owner@example.test',
        displayName: 'The Owner',
        status: 'active',
        roleSlug: 'owner',
      });
      expect(owners[0]?.passwordHash).toMatch(/^\$argon2id\$/);

      const created = await db.prisma.auditLog.findMany({
        where: { action: AUDIT_ACTIONS.OWNER_CREATED },
      });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        actorId: owners[0]?.id,
        actorType: 'account',
        subject: 'accounts',
        targetId: owners[0]?.documentId,
        metadata: { channel: 'setup_page' },
        ip,
      });
      expect((await status()).body).toEqual({ open: false });
    });

    it('lets the new owner sign in through the normal login', async () => {
      const { app, post } = await launch();
      await post(body());
      const login = await request(app.getHttpServer())
        .post(LOGIN)
        .set('X-Forwarded-For', nextIp())
        .send({ email: 'owner@example.test', password: PASSWORD });
      expect(login.status).toBe(200);
    });

    it('answers 404 to a second valid submit and audits it as closed', async () => {
      const { post, db } = await launch();
      expect((await post(body())).status).toBe(201);
      const again = await post(body({ email: 'second@example.test' }));
      expect(again.status).toBe(404);
      expect(await ownerRows(db)).toHaveLength(1);
      const rows = await db.prisma.auditLog.findMany({
        where: { action: AUDIT_ACTIONS.OWNER_SETUP_REJECTED },
      });
      expect(rows.map((row) => row.metadata)).toEqual([{ reason: 'closed' }]);
    });

    it('writes no audit row for a closed submit without a token field', async () => {
      const { post, db } = await launch({ OWNER_SETUP_TOKEN: undefined });
      await post({ email: 'a@example.test', password: PASSWORD });
      expect(
        await db.prisma.auditLog.count({
          where: { action: AUDIT_ACTIONS.OWNER_SETUP_REJECTED },
        }),
      ).toBe(0);
    });

    it('refuses the CLI after setup, and the page after the CLI', async () => {
      const first = await launch();
      expect((await first.post(body())).status).toBe(201);
      const cliAfterPage = await bootstrapOwner(first.db.prisma, {
        email: 'cli@example.test',
        password: PASSWORD,
      }).catch((e: unknown) => e);
      expect(cliAfterPage).toBeInstanceOf(OwnerBootstrapError);
      expect((cliAfterPage as OwnerBootstrapError).code).toBe(
        OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS,
      );

      const second = await launch();
      await bootstrapOwner(
        second.db.prisma,
        { email: 'cli@example.test', password: PASSWORD },
        { channel: 'cli' },
      );
      expect((await second.post(body())).status).toBe(404);
      expect(await ownerRows(second.db)).toHaveLength(1);
      const cliRow = await second.db.prisma.auditLog.findFirstOrThrow({
        where: { action: AUDIT_ACTIONS.OWNER_CREATED },
      });
      expect(cliRow).toMatchObject({
        actorType: 'system',
        actorId: null,
        metadata: { channel: 'cli' },
      });
    });

    it('creates exactly one owner when submits and a CLI run race', async () => {
      const { post, db, url } = await launch();
      const cli = openPrisma(url);
      handles.push(cli);
      const results = await Promise.all([
        ...Array.from({ length: CONCURRENT_SUBMITS }, (_, i) =>
          post(body({ email: `race${i}@example.test` })),
        ),
        bootstrapOwner(
          cli.prisma,
          { email: 'race-cli@example.test', password: PASSWORD },
          { channel: 'cli' },
        ).then(
          () => 'cli-created' as const,
          (error: unknown) => error,
        ),
      ]);
      expect(await ownerRows(db)).toHaveLength(1);
      const submits = results.slice(
        0,
        CONCURRENT_SUBMITS,
      ) as request.Response[];
      const cliOutcome = results[CONCURRENT_SUBMITS];
      const created = submits.filter((res) => res.status === 201).length;
      const cliCreated = cliOutcome === 'cli-created' ? 1 : 0;
      expect(created + cliCreated).toBe(1);
      for (const res of submits.filter((r) => r.status !== 201)) {
        expect(res.status).toBe(404);
      }
      const cliRefusedCode =
        cliOutcome instanceof OwnerBootstrapError ? cliOutcome.code : null;
      expect([null, OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS]).toContain(
        cliRefusedCode,
      );
    });

    it('answers 409 for an existing account email and never promotes it', async () => {
      const { post, db } = await launch();
      await db.prisma.account.create({
        data: {
          email: 'editor@example.test',
          displayName: 'Editor',
          passwordHash: await hashPassword(PASSWORD),
          status: 'active',
          role: { connect: { slug: 'editor' } },
        },
      });
      const res = await post(body({ email: 'editor@example.test' }));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ errorCode: 'OWNER_EMAIL_TAKEN' });
      const account = await db.prisma.account.findUniqueOrThrow({
        where: { email: 'editor@example.test' },
      });
      expect(account.roleSlug).toBe('editor');
      expect(await ownerRows(db)).toHaveLength(0);
    });

    it('answers 503 when the system roles are not seeded', async () => {
      const url = await template.fresh();
      const app = await createTestApp(
        devEnv({
          ...dbEnvOf(url),
          OWNER_SETUP_TOKEN: TOKEN,
          TRUST_PROXY_HOPS: '1',
        }),
      );
      apps.push(app);
      const res = await request(app.getHttpServer())
        .post(OWNER)
        .set('X-Forwarded-For', nextIp())
        .send(body());
      expect(res.status).toBe(503);
    });

    it('throttles the 6th submit from one IP, keyed on the real client (§12-8)', async () => {
      const { app } = await launch();
      const attacker = nextIp();
      let spoof = 0;
      const submit = (client: string) => {
        spoof += 1;
        return request(app.getHttpServer())
          .post(OWNER)
          .set('X-Forwarded-For', `198.51.100.${spoof}, ${client}`)
          .send(body({ setupToken: 'wrong' }));
      };
      for (let i = 0; i < SUBMIT_LIMIT; i += 1) {
        expect((await submit(attacker)).status).toBe(401);
      }
      expect((await submit(attacker)).status).toBe(429);
      expect((await submit(nextIp())).status).toBe(401);
    });
  });
});

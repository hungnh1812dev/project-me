import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import { unitOfWorkFromContentTrx } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import { Clock } from '../../src/common/time/clock';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import {
  TURNSTILE_VERIFIER,
  type TurnstileOutcome,
  type TurnstileVerifier,
} from '../../src/infrastructure/turnstile/turnstile.port';
import { seedRolePermissions } from '../../src/modules/access/roles/role-permissions.seed';
import { AUDIT_ACTIONS } from '../../src/modules/security-audit/security-audit.constants';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { KyselyContentRepository } from '../../src/modules/content-engine/adapters/KyselyContent.repository';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
import { ReviewerCleanupJob } from '../../src/modules/reviewer/reviewer-cleanup.job';
import {
  REVIEWER_IP_WINDOW_MS,
  REVIEWER_MAX_ACTIVE_SESSIONS,
  REVIEWER_SESSION_TTL_MS,
} from '../../src/modules/reviewer/reviewer.constants';
import { ARTICLE_DEFINITION } from '../fixtures/access.fixture';
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

const PASSWORD = 'correct horse battery staple';
const REVIEWER = '/api/v1/reviewer';
const LOGIN = '/api/v1/auth/login';
const DOCS = '/api/v1/documents/article';
const OCTET_RANGE = 250;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.31.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

const outcome: { value: TurnstileOutcome } = { value: 'passed' };
const verifier = {
  isConfigured: true,
  verify: (): Promise<TurnstileOutcome> => Promise.resolve(outcome.value),
} satisfies TurnstileVerifier;

const SESSION_BODY = {
  visitorRole: 'Recruiter',
  purposeTags: ['hiring'],
  notes: '<b>hello</b> plain text',
  turnstileToken: 'token',
};

describe('reviewer backend (T31, D2; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let owner: string;
  let admin: string;
  let clockOffset = 0;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION]);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      planMigration(emptySnapshot(), [
        registry.resolve('article').definition,
      ]).statements.join('\n'),
    );
    await client.end();
    content = createContentDb(databaseUrl);
    const repository = new KyselyContentRepository(registry);
    await content.transaction().execute(async (trx) => {
      for (const [published, title] of [
        [true, 'Live'],
        [false, 'Draft only'],
      ] as const) {
        await repository.insertTree(unitOfWorkFromContentTrx(trx), 'article', {
          documentId: randomUUID(),
          publishedAt: published ? new Date() : null,
          values: { title, body: '<p>x</p>', priority: 1 },
          components: {},
        });
      }
    });

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
      [
        {
          token: ContentRegistry,
          value: { registry: () => Promise.resolve(registry) },
        },
        { token: TURNSTILE_VERIFIER, value: verifier },
      ],
    );
    const realNow = Date.now.bind(Date);
    jest
      .spyOn(app.get(Clock), 'now')
      .mockImplementation(() => realNow() + clockOffset);
    owner = await signedIn('owner');
    admin = await signedIn('admin');
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await db?.close();
    await postgres?.stop();
  });

  beforeEach(() => {
    outcome.value = 'passed';
  });

  const http = () => request(app.getHttpServer());
  const from = (ip = nextIp()) => ({ 'X-Forwarded-For': ip });
  const bearer = (token: string, ip = nextIp()) => ({
    Authorization: `Bearer ${token}`,
    ...from(ip),
  });
  let accountCount = 0;

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `t31-user${accountCount}@example.test`;
    await db.prisma.account.create({
      data: {
        email,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: roleSlug } },
      },
    });
    const res = await http()
      .post(LOGIN)
      .set(from())
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  const setEnabled = (enabled: boolean, token = owner) =>
    http().put(`${REVIEWER}/settings`).set(bearer(token)).send({ enabled });

  const startSession = (body: object = SESSION_BODY, ip = nextIp()) =>
    http().post(`${REVIEWER}/sessions`).set(from(ip)).send(body);

  async function newReviewerToken(): Promise<string> {
    const res = await startSession();
    expect(res.status).toBe(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('is off by default: status false, session creation 403', async () => {
    const status = await http().get(`${REVIEWER}/status`).set(from());
    expect(status.body).toEqual({ enabled: false });
    const res = await startSession();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ errorCode: 'REVIEWER_DISABLED' });
  });

  it('settings are owner only (401 anonymous, 403 admin) and listing too', async () => {
    expect(
      (await http().put(`${REVIEWER}/settings`).set(from()).send({})).status,
    ).toBe(401);
    expect((await setEnabled(true, admin)).status).toBe(403);
    expect(
      (await http().get(`${REVIEWER}/sessions`).set(bearer(admin))).status,
    ).toBe(403);
    expect((await setEnabled(true, owner)).status).toBe(200);
    const bad = await http()
      .put(`${REVIEWER}/settings`)
      .set(bearer(owner))
      .send({ enabled: 'yes' });
    expect(bad.status).toBe(400);
    const status = await http().get(`${REVIEWER}/status`).set(from());
    expect(status.body).toEqual({ enabled: true });
    const audit = await db.prisma.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.REVIEWER_SETTINGS_CHANGED },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('creates a 24 h read-only session: published only, drafts 403, writes 403', async () => {
    const ip = nextIp();
    const res = await startSession(SESSION_BODY, ip);
    expect(res.status).toBe(201);
    const body = res.body as { accessToken: string; expiresAt: string };
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(REVIEWER_SESSION_TTL_MS - 60_000);

    const me = await http()
      .get('/api/v1/auth/me')
      .set(bearer(body.accessToken));
    expect(me.body).toMatchObject({ role: 'reviewer' });
    // T33a: a reviewer session lists read permissions only.
    const { permissions } = me.body as { permissions: string[] };
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions.every((entry) => entry.endsWith(':read'))).toBe(true);

    const list = await http()
      .get(`${DOCS}?status=published`)
      .set(bearer(body.accessToken));
    expect(list.status).toBe(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
    const draft = await http()
      .get(`${DOCS}?status=draft`)
      .set(bearer(body.accessToken));
    expect(draft.status).toBe(403);
    const write = await http()
      .post(DOCS)
      .set(bearer(body.accessToken))
      .send({ values: { title: 'x' } });
    expect(write.status).toBe(403);
    const roles = await http()
      .get('/api/v1/roles')
      .set(bearer(body.accessToken));
    expect(roles.status).toBe(403);

    const stored = await db.prisma.reviewerSession.findFirstOrThrow({
      orderBy: { id: 'desc' },
    });
    expect(stored.ipHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.ipHmac).not.toContain(ip);
    expect(stored.notes).toBe(SESSION_BODY.notes);
    const account = await db.prisma.account.findUniqueOrThrow({
      where: { id: stored.accountId },
    });
    expect(account.passwordHash).toBeNull();
    expect(account.roleSlug).toBe('reviewer');
    const audit = await db.prisma.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.REVIEWER_SESSION_CREATED },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('reviewer tokens are refused on self-service identity routes (403)', async () => {
    const token = await newReviewerToken();
    clockOffset += REVIEWER_IP_WINDOW_MS + 1_000;
    for (const [path, body] of [
      ['/api/v1/auth/2fa/totp/setup', {}],
      ['/api/v1/auth/2fa/email/send-code', {}],
      ['/api/v1/auth/2fa/enable', { code: '123456', password: 'x' }],
      ['/api/v1/auth/2fa/disable', { code: '123456', password: 'x' }],
      [
        '/api/v1/auth/password/change',
        { currentPassword: 'x', newPassword: 'y' },
      ],
    ] as const) {
      const res = await http().post(path).set(bearer(token)).send(body);
      expect(res.status).toBe(403);
    }
  });

  it('reviewer accounts are invisible to and unmanageable through the accounts API', async () => {
    const reviewer = await db.prisma.account.findFirstOrThrow({
      where: { roleSlug: 'reviewer' },
    });
    const list = await http().get('/api/v1/accounts').set(bearer(owner));
    const ids = (list.body as { data: { id: string }[] }).data.map((a) => a.id);
    expect(ids).not.toContain(reviewer.documentId);
    for (const path of [
      `/api/v1/accounts/${reviewer.documentId}/disable`,
      `/api/v1/accounts/${reviewer.documentId}/enable`,
      `/api/v1/accounts/${reviewer.documentId}/invite/resend`,
      `/api/v1/accounts/${reviewer.documentId}/sessions/revoke`,
    ]) {
      expect((await http().post(path).set(bearer(owner))).status).toBe(404);
    }
    const patch = await http()
      .patch(`/api/v1/accounts/${reviewer.documentId}`)
      .set(bearer(owner))
      .send({ displayName: 'x' });
    expect(patch.status).toBe(404);
  });

  it('audit rows of a reviewer session hold the IP HMAC, never the raw IP', async () => {
    const ip = nextIp();
    expect((await startSession(SESSION_BODY, ip)).status).toBe(201);
    const row = await db.prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.REVIEWER_SESSION_CREATED },
      orderBy: { id: 'desc' },
    });
    expect(row.ip).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ip).not.toBe(ip);
    clockOffset += REVIEWER_IP_WINDOW_MS + 1_000;
  });

  it('a reviewer cannot log in with a password', async () => {
    const account = await db.prisma.account.findFirstOrThrow({
      where: { roleSlug: 'reviewer' },
    });
    const res = await http()
      .post(LOGIN)
      .set(from())
      .send({ email: account.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('validates input: notes over 500 chars, control chars, unknown keys, missing token', async () => {
    for (const patch of [
      { notes: 'a'.repeat(501) },
      { notes: 'bad\u0000char' },
      { extra: true },
      { turnstileToken: '' },
      { purposeTags: new Array<string>(11).fill('x') },
      { visitorRole: '' },
    ]) {
      const res = await startSession({ ...SESSION_BODY, ...patch });
      expect(res.status).toBe(400);
    }
  });

  it('Turnstile: failed -> 400, unavailable -> 503; neither creates a session', async () => {
    const before = await db.prisma.reviewerSession.count();
    outcome.value = 'failed';
    const failed = await startSession();
    expect(failed.status).toBe(400);
    expect(failed.body).toMatchObject({
      errorCode: 'REVIEWER_TURNSTILE_FAILED',
    });
    outcome.value = 'unavailable';
    expect((await startSession()).status).toBe(503);
    expect(await db.prisma.reviewerSession.count()).toBe(before);
  });

  it('allows one session per IP per 10 minutes, with Retry-After', async () => {
    const ip = nextIp();
    expect((await startSession(SESSION_BODY, ip)).status).toBe(201);
    const second = await startSession(SESSION_BODY, ip);
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ errorCode: 'REVIEWER_IP_LIMITED' });
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
    clockOffset += REVIEWER_IP_WINDOW_MS + 1_000;
    expect((await startSession(SESSION_BODY, ip)).status).toBe(201);
  });

  it('refuses new sessions at the global cap of active sessions', async () => {
    const seed = await db.prisma.reviewerSession.findFirstOrThrow();
    const active = await db.prisma.reviewerSession.count({
      where: { expiresAt: { gt: new Date(Date.now() + clockOffset) } },
    });
    const fill = REVIEWER_MAX_ACTIVE_SESSIONS - active;
    expect(fill).toBeGreaterThan(0);
    await db.prisma.reviewerSession.createMany({
      data: Array.from({ length: fill }, () => ({
        accountId: seed.accountId,
        visitorRole: 'filler',
        ipHmac: 'filler',
        expiresAt: new Date(Date.now() + clockOffset + 3_600_000),
      })),
    });
    const res = await startSession();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ errorCode: 'REVIEWER_CAPACITY_REACHED' });
    await db.prisma.reviewerSession.deleteMany({
      where: { visitorRole: 'filler' },
    });
  });

  it('owner lists sessions (notes as stored text, no ip), newest first', async () => {
    const res = await http()
      .get(`${REVIEWER}/sessions?pageSize=2`)
      .set(bearer(owner));
    expect(res.status).toBe(200);
    const page = res.body as {
      data: Record<string, unknown>[];
      meta: { total: number; pageSize: number };
    };
    expect(page.data).toHaveLength(2);
    expect(page.meta.pageSize).toBe(2);
    expect(page.data[0]).toMatchObject({
      visitorRole: 'Recruiter',
      notes: SESSION_BODY.notes,
      active: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/ipHmac|ip_hmac/);
  });

  it('switching off revokes live sessions on their next request; on again does not revive them', async () => {
    const token = await newReviewerToken();
    clockOffset += REVIEWER_IP_WINDOW_MS + 1_000;
    const ok = await http().get(`${DOCS}?status=published`).set(bearer(token));
    expect(ok.status).toBe(200);

    const roleBefore = await db.prisma.role.findUniqueOrThrow({
      where: { slug: 'reviewer' },
    });
    expect((await setEnabled(false)).status).toBe(200);
    const listed = await http().get(`${REVIEWER}/sessions`).set(bearer(owner));
    const rows = (listed.body as { data: { active: boolean }[] }).data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !row.active)).toBe(true);
    const roleAfter = await db.prisma.role.findUniqueOrThrow({
      where: { slug: 'reviewer' },
    });
    expect(roleAfter.policyVersion).toBe(roleBefore.policyVersion + 1);

    const dead = await http()
      .get(`${DOCS}?status=published`)
      .set(bearer(token));
    expect(dead.status).toBe(401);
    expect((await startSession()).status).toBe(403);

    await setEnabled(true);
    const stillDead = await http()
      .get(`${DOCS}?status=published`)
      .set(bearer(token));
    expect(stillDead.status).toBe(401);
  });

  it('cleanup deletes expired reviewer accounts and their sessions only', async () => {
    const token = await newReviewerToken();
    const before = await db.prisma.reviewerSession.count();
    const job = app.get(ReviewerCleanupJob);
    expect(await job.run()).toBe(0);
    clockOffset += REVIEWER_SESSION_TTL_MS + 1_000;
    const deleted = await job.run();
    expect(deleted).toBe(before);
    expect(await db.prisma.reviewerSession.count()).toBe(0);
    expect(
      await db.prisma.account.count({ where: { roleSlug: 'reviewer' } }),
    ).toBe(0);
    // Owner and admin accounts and audit rows survive.
    expect(await db.prisma.account.count()).toBe(2);
    expect(
      await db.prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.REVIEWER_SESSION_CREATED },
      }),
    ).toBeGreaterThan(0);
    expect(token).toBeTruthy();
  });
});

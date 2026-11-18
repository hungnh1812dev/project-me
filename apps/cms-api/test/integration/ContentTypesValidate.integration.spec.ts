import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { TURNSTILE_VERIFIER } from '../../src/modules/reviewer/application/Reviewer.port';
import {
  ARTICLE_DEFINITION,
  NOTE_DEFINITION,
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/Access.fixture';
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

const PASSWORD = 'correct horse battery staple';
const VALIDATE = '/api/v1/content-types/validate';
const TOKENS = '/api/v1/api-tokens';
const LOGIN = '/api/v1/auth/login';
const REVIEWER = '/api/v1/reviewer';
const REVIEWER_SESSION_BODY = {
  visitorRole: 'Recruiter',
  purposeTags: ['hiring'],
  notes: 'plain text',
  turnstileToken: 'token',
};
const OCTET_RANGE = 250;
const THROTTLE_LIMIT = 120;
const BODY_OVER_LIMIT_BYTES = 101 * 1024;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.4.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

const NEW_DEFINITION = {
  slug: 'page',
  displayName: 'Page',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'title', type: 'string' }],
};

interface ValidateBody {
  valid: boolean;
  errors: { path: (string | number)[]; rule: string; message: string }[];
}

describe('POST /content-types/validate (SCB-2, SB-10; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let accountCount = 0;
  let owner: string;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);
    const registry = ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION, NOTE_DEFINITION]);
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
        REVIEWER_FEATURE_ENABLED: 'true',
      }),
      [
        { token: ContentRegistry, value: { registry: () => Promise.resolve(registry) } },
        {
          token: TURNSTILE_VERIFIER,
          value: { isConfigured: true, verify: () => Promise.resolve('passed') },
        },
      ],
    );
    owner = await signedIn('owner');
    for (const role of ['admin', 'editor']) tokens[role] = await signedIn(role);
    tokens.reviewer = await reviewerSession();
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': nextIp(),
  });
  const callsByToken = new Map<string, number>();
  const validate = (token: string, body: unknown) => {
    callsByToken.set(token, (callsByToken.get(token) ?? 0) + 1);
    return http()
      .post(VALIDATE)
      .set(bearer(token))
      .send(body as object);
  };
  const auditCount = () => db.prisma.auditLog.count();

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `scb2-user${accountCount}@example.test`;
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
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function reviewerSession(): Promise<string> {
    const enabled = await http()
      .put(`${REVIEWER}/settings`)
      .set(bearer(owner))
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    const res = await http()
      .post(`${REVIEWER}/sessions`)
      .set('X-Forwarded-For', nextIp())
      .send(REVIEWER_SESSION_BODY);
    expect(res.status).toBe(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  it('answers valid for a new definition and writes no audit row', async () => {
    const before = await auditCount();
    const res = await validate(owner, { definition: NEW_DEFINITION, mode: 'create' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body).toEqual({ valid: true, errors: [] });
    expect(await auditCount()).toBe(before);
  });

  it('reports path, rule and message for an invalid definition', async () => {
    const res = await validate(owner, {
      definition: { ...NEW_DEFINITION, slug: 'Bad Slug' },
      mode: 'create',
    });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const body = res.body as ValidateBody;
    expect(body.valid).toBe(false);
    expect(body.errors[0]).toEqual({
      path: expect.any(Array) as unknown,
      rule: expect.any(String) as unknown,
      message: expect.any(String) as unknown,
    });
  });

  it('reports a collision for a registered slug in create mode', async () => {
    const res = await validate(owner, { definition: ARTICLE_DEFINITION, mode: 'create' });
    expect(res.status).toBe(200);
    expect((res.body as ValidateBody).valid).toBe(false);
  });

  it('accepts the same file in update mode', async () => {
    const res = await validate(owner, { definition: ARTICLE_DEFINITION, mode: 'update' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, errors: [] });
  });

  it.each(['admin', 'editor', 'reviewer'])(
    'answers 403 for %s, even with a bad body',
    async (role) => {
      const token = tokens[role] as string;
      expect((await validate(token, { definition: NEW_DEFINITION, mode: 'create' })).status).toBe(
        403,
      );
      expect((await validate(token, { nope: true })).status).toBe(403);
    },
  );

  it('does not let an API token in', async () => {
    const created = await http()
      .post(TOKENS)
      .set(bearer(owner))
      .send({ name: 'CI', scope: { permissions: [{ subject: 'article', action: 'read' }] } });
    expect(created.status).toBe(201);
    const apiToken = (created.body as { token: string }).token;
    const res = await validate(apiToken, { definition: NEW_DEFINITION, mode: 'create' });
    expect(res.status).toBe(401);
  });

  it('answers 401 without a token', async () => {
    const res = await http().post(VALIDATE).set('X-Forwarded-For', nextIp()).send({});
    expect(res.status).toBe(401);
  });

  it.each([
    ['no body', {}],
    ['definition not an object', { definition: 'x', mode: 'create' }],
    ['definition an array', { definition: [], mode: 'create' }],
    ['definition null', { definition: null, mode: 'create' }],
    ['unknown mode', { definition: NEW_DEFINITION, mode: 'delete' }],
    ['unknown key', { definition: NEW_DEFINITION, mode: 'create', extra: 1 }],
  ])('answers 400 for %s', async (_name, body) => {
    const res = await validate(owner, body);
    expect(res.status).toBe(400);
  });

  // Refused by the body parser before the throttle, so not counted in `callsByToken`.
  it('answers 413 for a body over the JSON limit', async () => {
    const res = await http()
      .post(VALIDATE)
      .set(bearer(owner))
      .send({
        definition: { ...NEW_DEFINITION, padding: 'x'.repeat(BODY_OVER_LIMIT_BYTES) },
        mode: 'create',
      });
    expect(res.status).toBe(413);
  });

  it('answers 429 on the 121st call of one owner and keeps no-store', async () => {
    const body = { definition: NEW_DEFINITION, mode: 'create' };
    // Earlier tests already spent part of the owner's window; 413 and 400 calls count too.
    while ((callsByToken.get(owner) ?? 0) < THROTTLE_LIMIT) {
      expect((await validate(owner, body)).status).toBe(200);
    }
    const res = await validate(owner, body);
    expect(res.status).toBe(429);
    expect(res.headers['cache-control']).toContain('no-store');
  });
});

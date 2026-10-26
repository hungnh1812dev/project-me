import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import {
  ARTICLE_DEFINITION,
  NOTE_DEFINITION,
} from '../fixtures/access.fixture';
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
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/access.fixture';

const PASSWORD = 'correct horse battery staple';
const DOCUMENTS = '/api/v1/documents';
const ROLES = '/api/v1/roles';
const LOGIN = '/api/v1/auth/login';
const OCTET_RANGE = 250;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.5.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}
type Json = { [key: string]: unknown };
interface Presence {
  accountId: string;
  displayName: string;
  state: string;
  lastSeenAt: string;
}

describe('document presence (T26; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  let readOnly: string;
  let scoped: string;
  let ids: { editor: string; owner: string };

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = ContentTypeRegistry.fromDefinitions([
      ARTICLE_DEFINITION,
      NOTE_DEFINITION,
    ]);
    const definitions = registry
      .slugs()
      .map((slug) => registry.resolve(slug).definition);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      planMigration(emptySnapshot(), definitions).statements.join('\n'),
    );
    await client.end();
    content = createContentDb(databaseUrl);

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
      ],
    );
    owner = await signedIn('owner');
    editor = await signedIn('editor');
    guest = await signedIn('guest');
    await customRole('read-only', 20, [{ subject: 'article', action: 'read' }]);
    readOnly = await signedIn('read-only');
    await customRole('scoped-update', 21, [
      { subject: 'article', action: 'read' },
      {
        subject: 'article',
        action: 'update',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 1 }] },
      },
    ]);
    scoped = await signedIn('scoped-update');
    const accounts = await db.prisma.account.findMany({
      select: { documentId: true, displayName: true },
    });
    const idOf = (name: string) =>
      accounts.find((account) => account.displayName === name)
        ?.documentId as string;
    ids = { owner: idOf('User 1'), editor: idOf('User 2') };
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': nextIp(),
  });

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `t26-user${accountCount}@example.test`;
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

  async function customRole(slug: string, rank: number, permissions: Json[]) {
    const created = await http()
      .post(ROLES)
      .set(bearer(owner))
      .send({ slug, name: slug, rank });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const put = await http()
      .put(`${ROLES}/${id}/permissions`)
      .set(bearer(owner))
      .send({ permissions });
    expect(put.status).toBe(200);
  }

  async function createArticle(priority = 3): Promise<string> {
    const res = await http()
      .post(`${DOCUMENTS}/article`)
      .set(bearer(owner))
      .send({ values: { title: 'Doc', priority } });
    expect(res.status).toBe(201);
    return (res.body as { documentId: string }).documentId;
  }

  const beat = (id: string, token?: string, body: unknown = {}) => {
    const req = http()
      .post(`${DOCUMENTS}/article/${id}/presence`)
      .set('X-Forwarded-For', nextIp());
    return (
      token === undefined ? req : req.set('Authorization', `Bearer ${token}`)
    ).send(body as Json);
  };

  it('returns only accountId, displayName, state and lastSeenAt for everyone active', async () => {
    const id = await createArticle();
    const first = await beat(id, editor, { state: 'viewing' });
    expect(first.status).toBe(200);
    const second = await beat(id, owner);
    expect(second.status).toBe(200);
    const list = second.body as Presence[];
    expect(list).toHaveLength(2);
    for (const entry of list) {
      expect(Object.keys(entry).sort()).toEqual([
        'accountId',
        'displayName',
        'lastSeenAt',
        'state',
      ]);
    }
    const me = await http().get('/api/v1/auth/me').set(bearer(editor));
    expect((me.body as { id: string }).id).toBe(ids.editor);
    expect(typeof list[0]?.accountId).toBe('string');
    const mine = list.find((entry) => entry.accountId === ids.editor);
    expect(mine).toMatchObject({ displayName: 'User 2', state: 'viewing' });
    expect(Number.isNaN(Date.parse(mine?.lastSeenAt ?? ''))).toBe(false);
    expect(list.find((entry) => entry.accountId === ids.owner)?.state).toBe(
      'editing',
    );
  });

  it('repeated heartbeats from one account keep a single entry', async () => {
    const id = await createArticle();
    await beat(id, editor);
    const again = await beat(id, editor);
    expect(again.body as Presence[]).toHaveLength(1);
  });

  it('is 403 for the public role, a missing update permission and a guest', async () => {
    const id = await createArticle();
    expect((await beat(id)).status).toBe(403);
    expect((await beat(id, guest)).status).toBe(403);
    expect((await beat(id, readOnly)).status).toBe(403);
  });

  it('is 401 for an invalid credential', async () => {
    const id = await createArticle();
    expect((await beat(id, 'not-a-jwt')).status).toBe(401);
  });

  it('is 404 for an unknown document, a bad id and a row outside the update conditions', async () => {
    expect(
      (await beat('0194b0c0-0000-7000-8000-000000000000', editor)).status,
    ).toBe(404);
    expect((await beat('not-an-id', editor)).status).toBe(400);
    const outside = await createArticle(3);
    const inside = await createArticle(1);
    expect((await beat(outside, scoped)).status).toBe(404);
    expect((await beat(inside, scoped)).status).toBe(200);
  });

  it('is 404 for an unknown content type and 400 for a bad body', async () => {
    const id = await createArticle();
    const unknown = await http()
      .post(`${DOCUMENTS}/nope/${id}/presence`)
      .set(bearer(editor))
      .send({});
    expect(unknown.status).toBe(404);
    expect((await beat(id, editor, { state: 'dancing' })).status).toBe(400);
    expect((await beat(id, editor, { extra: 1 })).status).toBe(400);
  });
});

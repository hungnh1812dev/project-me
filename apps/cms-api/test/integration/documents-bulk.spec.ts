import { request as httpRequest } from 'node:http';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import { Client, Pool } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { seedRolePermissions } from '../../src/modules/access/roles/role-permissions.seed';
import {
  ContentDbProvider,
  createContentDb,
} from '../../src/modules/content-engine/content-database';
import { CONTENT_TYPE_PARSERS } from '../../src/modules/content-engine/content-database';
import { ContentRegistryProvider } from '../../src/modules/content-engine/content-registry.provider';
import { RegistryService } from '../../src/modules/content-engine/registry.service';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import type { ContentDatabase } from '../../src/modules/content-engine/tree-loader';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
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
const PROFILE_DEFINITION = {
  slug: 'profile',
  kind: 'single',
  draftAndPublish: true,
  fields: [{ name: 'name', type: 'string' }],
} as const;

const POST_DEFINITION = {
  slug: 'post',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'title', type: 'string' },
    {
      name: 'rows',
      type: 'component',
      repeatable: true,
      fields: [{ name: 'label', type: 'string' }],
    },
  ],
} as const;

const BULK_MAX_ITEMS = 50;
const BULK_MAX_COMPONENT_ROWS = 200;
const BULK_MAX_BODY_BYTES = 1024 * 1024;

interface BulkResult {
  index: number;
  status: 'ok' | 'error';
  documentId?: string;
  version?: number;
  statusCode?: number;
  errorCode?: string;
}
interface BulkBody {
  atomic: boolean;
  succeeded: number;
  failed: number;
  results: BulkResult[];
}

describe('document bulk (T34; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let counted: Kysely<ContentDatabase>;
  let statements = 0;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let scopedPublish: string;
  let scopedDelete: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = RegistryService.fromDefinitions([
      ARTICLE_DEFINITION,
      NOTE_DEFINITION,
      PROFILE_DEFINITION,
      POST_DEFINITION,
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
    counted = new Kysely<ContentDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: databaseUrl,
          types: CONTENT_TYPE_PARSERS,
        }),
      }),
      log: () => {
        statements += 1;
      },
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
          token: ContentRegistryProvider,
          value: { registry: () => Promise.resolve(registry) },
        },
        { token: ContentDbProvider, value: { db: counted } },
      ],
    );
    owner = await signedIn('owner');
    editor = await signedIn('editor');
    await customRole('scoped-publish', 20, [
      { subject: 'article', action: 'read' },
      {
        subject: 'article',
        action: 'publish',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 1 }] },
      },
    ]);
    scopedPublish = await signedIn('scoped-publish');
    await customRole('scoped-delete', 21, [
      { subject: 'article', action: 'read' },
      {
        subject: 'article',
        action: 'delete',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 3 }] },
      },
    ]);
    scopedDelete = await signedIn('scoped-delete');
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await counted?.destroy();
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
    const email = `t34-user${accountCount}@example.test`;
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

  const bulk = (
    slug: string,
    op: string,
    token: string | null,
    body: unknown,
  ) => {
    const req = http().post(`${DOCUMENTS}/${slug}/bulk/${op}`);
    return (
      token === null
        ? req.set('X-Forwarded-For', nextIp())
        : req.set(bearer(token))
    ).send(body as Json);
  };

  const article = (title: string, priority = 3, extra: Json = {}): Json => ({
    values: { title, priority },
    components: { reference: [{ values: { name: 'Ann', phone: 'p' } }] },
    ...extra,
  });

  async function createMany(titles: string[], priority = 3): Promise<string[]> {
    const res = await bulk('article', 'create', owner, {
      atomic: true,
      items: titles.map((title) => article(title, priority)),
    });
    expect(res.status).toBe(200);
    return (res.body as BulkBody).results.map((r) => r.documentId as string);
  }

  const rows = (documentId: string) =>
    content
      .withSchema('content')
      .selectFrom('article')
      .selectAll()
      .where('document_id', '=', documentId)
      .execute();
  const published = async (id: string) =>
    (await rows(id)).filter((row) => row.published_at !== null);

  describe('limits and kinds', () => {
    it('refuses a single type with 400 for every operation', async () => {
      for (const op of ['create', 'publish', 'unpublish', 'delete']) {
        const documentId = '8d8f1c4e-0000-4000-8000-000000000000';
        const items =
          op === 'create'
            ? [{ values: { name: 'x' } }]
            : op === 'publish'
              ? [{ documentId, expectedVersion: 1 }]
              : [{ documentId }];
        const res = await bulk('profile', op, owner, { atomic: false, items });
        expect(res.status).toBe(400);
        expect((res.body as { errorCode: string }).errorCode).toBe(
          'DOCUMENT_BULK_NOT_COLLECTION',
        );
      }
    });

    it('rejects more than 50 items and an empty list', async () => {
      const many = await bulk('article', 'create', owner, {
        atomic: false,
        items: Array.from({ length: BULK_MAX_ITEMS + 1 }, (_, i) =>
          article(`n${i}`),
        ),
      });
      expect(many.status).toBe(400);
      expect((many.body as { errorCode: string }).errorCode).toBe(
        'DOCUMENT_BULK_LIMIT',
      );
      const none = await bulk('article', 'create', owner, {
        atomic: false,
        items: [],
      });
      expect(none.status).toBe(400);
    });

    it('accepts exactly 50 items', async () => {
      const res = await bulk('article', 'create', owner, {
        atomic: true,
        items: Array.from({ length: BULK_MAX_ITEMS }, (_, i) =>
          article(`fifty${i}`),
        ),
      });
      expect(res.status).toBe(200);
      expect((res.body as BulkBody).succeeded).toBe(BULK_MAX_ITEMS);
    });

    it('rejects an item over 200 component rows (per item) and keeps the others', async () => {
      const post = (count: number): Json => ({
        values: { title: 'rows' },
        components: {
          rows: Array.from({ length: count }, () => ({
            values: { label: 'r' },
          })),
        },
      });
      const res = await bulk('post', 'create', owner, {
        atomic: false,
        items: [
          post(BULK_MAX_COMPONENT_ROWS + 1),
          post(BULK_MAX_COMPONENT_ROWS),
        ],
      });
      expect(res.status).toBe(200);
      const body = res.body as BulkBody;
      expect(body.results[0]).toMatchObject({
        status: 'error',
        statusCode: 400,
        errorCode: 'DOCUMENT_BULK_LIMIT',
      });
      expect(body.results[1]).toMatchObject({ status: 'ok' });
    });

    it('answers 413 over 1 MB and accepts a body between 100 KB and 1 MB', async () => {
      // Declared length over the limit: refused from the headers, before the body is sent.
      const declared = BULK_MAX_BODY_BYTES + 1_000;
      const { port } = app.getHttpServer().listen(0).address() as {
        port: number;
      };
      const answer = await new Promise<{ status: number; text: string }>(
        (resolve, reject) => {
          const req = httpRequest(
            {
              port,
              method: 'POST',
              path: `${DOCUMENTS}/article/bulk/create`,
              headers: {
                ...bearer(owner),
                'Content-Type': 'application/json',
                'Content-Length': declared,
              },
            },
            (res) => {
              let text = '';
              res.on('data', (chunk: Buffer) => (text += chunk.toString()));
              res.on('end', () => {
                req.destroy();
                resolve({ status: res.statusCode ?? 0, text });
              });
            },
          );
          req.on('error', () => undefined);
          req.write('{"atomic":false,');
          setTimeout(() => reject(new Error('no answer')), 10_000).unref();
        },
      );
      expect(answer.status).toBe(413);
      expect(answer.text).toContain('PAYLOAD_TOO_LARGE');
      const big = await bulk('article', 'create', owner, {
        atomic: false,
        items: [article('y'.repeat(200 * 1024))],
      });
      expect(big.status).toBe(200);
    });

    it('accepts a 500 KB bulk body, past the 100 KB global parser', async () => {
      const big = await bulk('article', 'create', owner, {
        atomic: false,
        items: [article('z'.repeat(500 * 1024))],
      });
      expect(big.status).toBe(200);
    });

    it('rejects malformed JSON with 400 and unknown envelope keys', async () => {
      const bad = await http()
        .post(`${DOCUMENTS}/article/bulk/create`)
        .set(bearer(owner))
        .set('Content-Type', 'application/json')
        .send('{"atomic":');
      expect(bad.status).toBe(400);
      const extra = await bulk('article', 'create', owner, {
        atomic: false,
        items: [article('a')],
        other: 1,
      });
      expect(extra.status).toBe(400);
      const notBool = await bulk('article', 'create', owner, {
        atomic: 'yes',
        items: [article('a')],
      });
      expect(notBool.status).toBe(400);
    });
  });

  describe('auth', () => {
    it('401 with a bad credential, 403 for anonymous and for a role without the action', async () => {
      const anon = await bulk('article', 'create', null, {
        atomic: false,
        items: [article('a')],
      });
      expect(anon.status).toBe(403);
      const noDelete = await bulk('article', 'delete', editor, {
        atomic: false,
        items: [{ documentId: '8d8f1c4e-0000-4000-8000-000000000000' }],
      });
      expect(noDelete.status).toBe(403);
      const bad = await http()
        .post(`${DOCUMENTS}/article/bulk/create`)
        .set({ Authorization: 'Bearer nope', 'X-Forwarded-For': nextIp() })
        .send({ atomic: false, items: [article('a')] });
      expect(bad.status).toBe(401);
    });

    it('404 for an unknown type', async () => {
      const res = await bulk('nothing', 'create', owner, {
        atomic: false,
        items: [article('a')],
      });
      expect(res.status).toBe(404);
    });
  });

  describe('create', () => {
    it('inserts the batch with a fixed number of statements', async () => {
      const run = async (count: number) => {
        statements = 0;
        const res = await bulk('article', 'create', owner, {
          atomic: true,
          items: Array.from({ length: count }, (_, i) => article(`q${i}`)),
        });
        expect(res.status).toBe(200);
        return statements;
      };
      const small = await run(2);
      const large = await run(40);
      expect(large).toBe(small);
    });

    it('stores drafts with the tree and returns ids only', async () => {
      const res = await bulk('article', 'create', owner, {
        atomic: true,
        items: [article('Tree')],
      });
      const body = res.body as BulkBody;
      expect(body.results[0]).toMatchObject({ status: 'ok', version: 1 });
      expect(Object.keys(body.results[0] ?? {}).sort()).toEqual([
        'documentId',
        'index',
        'status',
        'version',
      ]);
      const [draft] = await rows(body.results[0]?.documentId as string);
      expect(draft?.title).toBe('Tree');
      expect(draft?.published_at).toBeNull();
      const refs = await content
        .withSchema('content')
        .selectFrom('article__reference')
        .selectAll()
        .where('parent_id', '=', draft?.id as number)
        .execute();
      expect(refs).toHaveLength(1);
    });

    it('atomic: one bad item fails the request and writes nothing', async () => {
      const before = await content
        .withSchema('content')
        .selectFrom('article')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('title', '=', 'atomic-good')
        .executeTakeFirstOrThrow();
      const res = await bulk('article', 'create', owner, {
        atomic: true,
        items: [
          article('atomic-good'),
          { values: { title: 12 } },
          article('atomic-good'),
        ],
      });
      expect(res.status).toBe(400);
      expect((res.body as { details: { index: number } }).details.index).toBe(
        1,
      );
      const after = await content
        .withSchema('content')
        .selectFrom('article')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('title', '=', 'atomic-good')
        .executeTakeFirstOrThrow();
      expect(after.n).toBe(before.n);
    });

    it('partial: valid items are stored, bad ones reported by index', async () => {
      const res = await bulk('article', 'create', owner, {
        atomic: false,
        items: [
          article('partial-ok-1'),
          { values: { title: 12 } },
          'not an object',
          { values: { unknownField: 1 } },
          article('partial-ok-2'),
        ],
      });
      expect(res.status).toBe(200);
      const body = res.body as BulkBody;
      expect(body.succeeded).toBe(2);
      expect(body.failed).toBe(3);
      expect(body.results.map((r) => r.status)).toEqual([
        'ok',
        'error',
        'error',
        'error',
        'ok',
      ]);
      expect(body.results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    });

    it('applies the write allowlist per item: a role without create gets 403', async () => {
      const res = await bulk('article', 'create', scopedPublish, {
        atomic: false,
        items: [article('x')],
      });
      expect(res.status).toBe(403);
    });

    it('a type without draft and publish stores live rows', async () => {
      const res = await bulk('note', 'create', owner, {
        atomic: true,
        items: [{ values: { text: 'hello' } }],
      });
      expect(res.status).toBe(200);
      const id = (res.body as BulkBody).results[0]?.documentId as string;
      const note = await content
        .withSchema('content')
        .selectFrom('note')
        .selectAll()
        .where('document_id', '=', id)
        .executeTakeFirstOrThrow();
      expect(note.published_at).not.toBeNull();
    });
  });

  describe('publish', () => {
    it('publishes many and keeps the drafts', async () => {
      const ids = await createMany(['p1', 'p2', 'p3']);
      const res = await bulk('article', 'publish', owner, {
        atomic: true,
        items: ids.map((documentId) => ({ documentId, expectedVersion: 1 })),
      });
      expect(res.status).toBe(200);
      expect((res.body as BulkBody).succeeded).toBe(3);
      for (const id of ids) {
        expect(await published(id)).toHaveLength(1);
        expect(await rows(id)).toHaveLength(2);
      }
    });

    it('partial: a stale version and a missing document fail alone', async () => {
      const [a, b] = await createMany(['s1', 's2']);
      const res = await bulk('article', 'publish', owner, {
        atomic: false,
        items: [
          { documentId: a, expectedVersion: 5 },
          { documentId: b, expectedVersion: 1 },
          {
            documentId: '8d8f1c4e-0000-4000-8000-000000000000',
            expectedVersion: 1,
          },
        ],
      });
      const body = res.body as BulkBody;
      expect(body.results[0]).toMatchObject({
        status: 'error',
        statusCode: 409,
        errorCode: 'DOCUMENT_VERSION_CONFLICT',
      });
      expect(body.results[1]?.status).toBe('ok');
      expect(body.results[2]).toMatchObject({
        status: 'error',
        statusCode: 404,
      });
      expect(await published(a as string)).toHaveLength(0);
      expect(await published(b as string)).toHaveLength(1);
    });

    it('atomic: a stale version rolls back the earlier items', async () => {
      const [a, b] = await createMany(['a1', 'a2']);
      const res = await bulk('article', 'publish', owner, {
        atomic: true,
        items: [
          { documentId: a, expectedVersion: 1 },
          { documentId: b, expectedVersion: 9 },
        ],
      });
      expect(res.status).toBe(409);
      expect((res.body as { details: { index: number } }).details.index).toBe(
        1,
      );
      expect(await published(a as string)).toHaveLength(0);
    });

    it('per item ABAC: rows outside the publish conditions are 404 per item', async () => {
      const inScope = await createMany(['abac-in'], 1);
      const outScope = await createMany(['abac-out'], 3);
      const res = await bulk('article', 'publish', scopedPublish, {
        atomic: false,
        items: [
          { documentId: outScope[0], expectedVersion: 1 },
          { documentId: inScope[0], expectedVersion: 1 },
        ],
      });
      const body = res.body as BulkBody;
      expect(body.results[0]).toMatchObject({
        status: 'error',
        statusCode: 404,
      });
      expect(body.results[1]?.status).toBe('ok');
      expect(await published(outScope[0] as string)).toHaveLength(0);
    });

    it('rejects duplicates and bad items for the whole request (400)', async () => {
      const [a] = await createMany(['dup']);
      const dup = await bulk('article', 'publish', owner, {
        atomic: false,
        items: [
          { documentId: a, expectedVersion: 1 },
          { documentId: a, expectedVersion: 1 },
        ],
      });
      expect(dup.status).toBe(400);
      const bad = await bulk('article', 'publish', owner, {
        atomic: false,
        items: [{ documentId: 'nope', expectedVersion: 1 }],
      });
      expect(bad.status).toBe(400);
    });

    it('400 for a type without draft and publish', async () => {
      const res = await bulk('note', 'publish', owner, {
        atomic: false,
        items: [
          {
            documentId: '8d8f1c4e-0000-4000-8000-000000000000',
            expectedVersion: 1,
          },
        ],
      });
      expect(res.status).toBe(400);
      expect((res.body as { errorCode: string }).errorCode).toBe(
        'DOCUMENT_NOT_PUBLISHABLE',
      );
    });
  });

  describe('unpublish and delete', () => {
    it('unpublishes many', async () => {
      const ids = await createMany(['u1', 'u2']);
      await bulk('article', 'publish', owner, {
        atomic: true,
        items: ids.map((documentId) => ({ documentId, expectedVersion: 1 })),
      });
      const res = await bulk('article', 'unpublish', owner, {
        atomic: false,
        items: [...ids, '8d8f1c4e-0000-4000-8000-000000000000'].map(
          (documentId) => ({ documentId }),
        ),
      });
      const body = res.body as BulkBody;
      expect(body.succeeded).toBe(2);
      expect(body.results[2]).toMatchObject({
        status: 'error',
        statusCode: 404,
      });
      for (const id of ids) expect(await published(id)).toHaveLength(0);
    });

    it('deletes both rows; per-item ABAC 404 leaves the other rows alone', async () => {
      const inScope = await createMany(['d-in'], 3);
      const outScope = await createMany(['d-out'], 1);
      const res = await bulk('article', 'delete', scopedDelete, {
        atomic: false,
        items: [{ documentId: outScope[0] }, { documentId: inScope[0] }],
      });
      const body = res.body as BulkBody;
      expect(body.results[0]).toMatchObject({
        status: 'error',
        statusCode: 404,
      });
      expect(body.results[1]?.status).toBe('ok');
      expect(await rows(inScope[0] as string)).toHaveLength(0);
      expect(await rows(outScope[0] as string)).toHaveLength(1);
    });

    it('atomic delete: one out-of-scope item keeps everything', async () => {
      const inScope = await createMany(['da-in'], 3);
      const outScope = await createMany(['da-out'], 1);
      const res = await bulk('article', 'delete', scopedDelete, {
        atomic: true,
        items: [{ documentId: inScope[0] }, { documentId: outScope[0] }],
      });
      expect(res.status).toBe(404);
      expect(await rows(inScope[0] as string)).toHaveLength(1);
    });
  });

  it('routes bulk paths to the bulk controller, not to a document id', async () => {
    const res = await bulk('article', 'publish', owner, {
      atomic: false,
      items: [],
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).not.toMatch(/uuid/i);
  });
});

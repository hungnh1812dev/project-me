import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { MASKED_FIELDS_KEY } from '../../src/modules/access/domain/Access.constants';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { contentTrxOf } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
} from '../../src/modules/documents/application/Documents.port';
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
import { startPostgres, type TestPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/access.fixture';

const PASSWORD = 'correct horse battery staple';
const DOCUMENTS = '/api/v1/documents';
const ROLES = '/api/v1/roles';
const TOKENS = '/api/v1/api-tokens';
const LOGIN = '/api/v1/auth/login';
const OCTET_RANGE = 250;
const RAW_PHONE = 'RAW-PHONE-5551234';
const RAW_BODY = '<p>RAW-BODY-SECRET</p>';
const RAW_META = 'RAW-META-SECRET';

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.5.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

type Json = { [key: string]: unknown };
interface Doc {
  documentId: string;
  version: number;
  publishedAt: string | null;
  createdBy?: number;
  updatedBy?: number;
  values: Json;
  components: { reference: { componentUid: string; values: Json }[] | null };
  [MASKED_FIELDS_KEY]: string[];
}
interface Conflict {
  errorCode: string;
  details: {
    currentVersion: number;
    server: Doc | null;
    submitted: Doc | null;
    diff: { path: string; change: string }[];
  };
}

describe('document write API (T21; Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  let narrow: string;
  let priorityThree: string;

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
    await customRole('narrow', 20, [
      {
        subject: 'article',
        action: 'read',
        readableFields: ['title'],
      },
      {
        subject: 'article',
        action: 'update',
        writableFields: ['title', 'body'],
      },
    ]);
    narrow = await signedIn('narrow');
    await customRole('priority-three', 21, [
      { subject: 'article', action: 'read' },
      {
        subject: 'article',
        action: 'update',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 3 }] },
      },
    ]);
    priorityThree = await signedIn('priority-three');
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
    const email = `t21-user${accountCount}@example.test`;
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

  const post = (slug: string, token: string, body: unknown) =>
    http()
      .post(`${DOCUMENTS}/${slug}`)
      .set(bearer(token))
      .send(body as Json);
  const put = (slug: string, id: string, token: string, body: unknown) =>
    http()
      .put(`${DOCUMENTS}/${slug}/${id}`)
      .set(bearer(token))
      .send(body as Json);

  const articleBody = (extra: Json = {}): Json => ({
    values: {
      title: 'First',
      body: RAW_BODY,
      priority: 3,
      score: '1.50',
      featured: true,
      releaseDate: '2026-03-01',
      releasedAt: '2026-03-01T10:00:00Z',
      meta: { secret: RAW_META },
    },
    components: { reference: [{ values: { name: 'Ann', phone: RAW_PHONE } }] },
    ...extra,
  });

  async function createArticle(
    token = editor,
    body: Json = articleBody(),
  ): Promise<Doc> {
    const res = await post('article', token, body);
    expect(res.status).toBe(201);
    return res.body as Doc;
  }

  const storedRow = async (documentId: string) => {
    const rows = await content
      .withSchema('content')
      .selectFrom('article')
      .selectAll()
      .where('document_id', '=', documentId)
      .execute();
    return rows;
  };

  describe('create', () => {
    it('creates a draft at version 1 and stamps the author', async () => {
      const doc = await createArticle();
      expect(doc.version).toBe(1);
      expect(doc.publishedAt).toBeNull();
      expect(doc.values.title).toBe('First');
      expect(doc.components.reference?.[0]?.values.name).toBe('Ann');
      expect(typeof doc.createdBy).toBe('number');
      const rows = await storedRow(doc.documentId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.published_at).toBeNull();
    });

    it('refuses anonymous (403), guest (403) and an unknown type (404)', async () => {
      const anonymous = await http()
        .post(`${DOCUMENTS}/article`)
        .set('X-Forwarded-For', nextIp())
        .send(articleBody());
      expect(anonymous.status).toBe(403);
      expect((await post('article', guest, articleBody())).status).toBe(403);
      expect((await post('nope', editor, {})).status).toBe(404);
    });

    it('rejects unknown keys, bad types, a non-object body and client-sent system fields', async () => {
      const unknown = await post('article', editor, { values: { zzz: 1 } });
      expect(unknown.status).toBe(400);
      expect((unknown.body as Conflict).errorCode).toBe('FIELD_UNKNOWN');
      const typed = await post('article', editor, {
        values: { priority: 'high' },
      });
      expect(typed.status).toBe(400);
      expect((typed.body as Conflict).errorCode).toBe('DOCUMENT_INVALID');
      expect((await post('article', editor, [])).status).toBe(400);
      expect(
        (await post('article', editor, { version: 9, values: {} })).status,
      ).toBe(400);
    });

    it('stores a type without draft and publish as a live row', async () => {
      const res = await post('note', editor, { values: { text: 'live' } });
      expect(res.status).toBe(201);
      expect((res.body as Doc).publishedAt).not.toBeNull();
      const read = await http()
        .get(`${DOCUMENTS}/note/${(res.body as Doc).documentId}`)
        .set('X-Forwarded-For', nextIp());
      expect(read.status).toBe(200);
      const updated = await put('note', (res.body as Doc).documentId, editor, {
        version: 1,
        values: { text: 'live 2' },
      });
      expect(updated.status).toBe(200);
      expect((updated.body as Doc).version).toBe(2);
    });

    it('lets an API token with create scope create', async () => {
      const made = await http()
        .post(TOKENS)
        .set(bearer(owner))
        .send({
          name: 't21',
          scope: { permissions: [{ subject: 'article', action: 'create' }] },
        });
      expect(made.status).toBe(201);
      const token = (made.body as { token: string }).token;
      expect((await post('article', token, articleBody())).status).toBe(201);
    });
  });

  describe('update with optimistic concurrency', () => {
    it('bumps the version and replaces the component tree', async () => {
      const doc = await createArticle();
      const uid = doc.components.reference?.[0]?.componentUid;
      const res = await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Second' },
        components: {
          reference: [{ componentUid: uid, values: { name: 'Bob' } }],
        },
      });
      expect(res.status).toBe(200);
      const next = res.body as Doc;
      expect(next.version).toBe(2);
      expect(next.values.title).toBe('Second');
      expect(next.components.reference?.[0]?.componentUid).toBe(uid);
      expect(next.components.reference?.[0]?.values).toEqual({
        name: 'Bob',
        phone: RAW_PHONE,
      });
    });

    it('rejects a stale version with 409 and no change', async () => {
      const doc = await createArticle();
      await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Winner' },
      });
      const res = await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Loser' },
      });
      expect(res.status).toBe(409);
      const body = res.body as Conflict;
      expect(body.errorCode).toBe('DOCUMENT_VERSION_CONFLICT');
      expect(body.details.currentVersion).toBe(2);
      expect(body.details.server?.values.title).toBe('Winner');
      expect(body.details.submitted?.values.title).toBe('Loser');
      expect(body.details.diff).toEqual([
        expect.objectContaining({ path: 'values.title', change: 'changed' }),
      ]);
      expect((await storedRow(doc.documentId))[0]?.title).toBe('Winner');
    });

    it('lets exactly one of two concurrent updates win', async () => {
      const doc = await createArticle();
      const results = await Promise.all(
        ['A', 'B', 'C'].map((title) =>
          put('article', doc.documentId, editor, {
            version: 1,
            values: { title },
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      const rows = await storedRow(doc.documentId);
      expect(rows[0]?.version).toBe(2);
    });

    it('answers 404 DOCUMENT_NOT_FOUND when the row vanishes before it is locked (planned change)', async () => {
      const doc = await createArticle();
      const repository = app.get<DocumentRepository>(DOCUMENT_REPOSITORY, {
        strict: false,
      });
      const replaceTree = repository.replaceTree.bind(repository);
      const spy = jest
        .spyOn(repository, 'replaceTree')
        .mockImplementationOnce(async (unit, slug, ref, input) => {
          await contentTrxOf(unit)
            .withSchema('content')
            .deleteFrom('article')
            .where('document_id', '=', ref.documentId)
            .execute();
          return replaceTree(unit, slug, ref, input);
        });
      const res = await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Gone' },
      });
      spy.mockRestore();
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        errorCode: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found.',
      });
      expect(await storedRow(doc.documentId)).toHaveLength(1);
    });

    it('validates the version and the document', async () => {
      const doc = await createArticle();
      for (const version of [undefined, 0, 'x', 1.5]) {
        expect(
          (await put('article', doc.documentId, editor, { version })).status,
        ).toBe(400);
      }
      expect(
        (
          await put('article', '3b241101-e2bb-4255-8caf-4136c566a962', editor, {
            version: 1,
          })
        ).status,
      ).toBe(404);
      expect(
        (await put('article', 'not-a-uuid', editor, { version: 1 })).status,
      ).toBe(400);
      expect(
        (await put('article', doc.documentId, guest, { version: 1 })).status,
      ).toBe(403);
    });

    it('enforces the row conditions of the update permission', async () => {
      const mine = await createArticle(editor, {
        values: { title: 'p3', priority: 3 },
      });
      const other = await createArticle(editor, {
        values: { title: 'p4', priority: 4 },
      });
      expect(
        (
          await put('article', mine.documentId, priorityThree, {
            version: 1,
            values: { title: 'edited' },
          })
        ).status,
      ).toBe(200);
      const hidden = await put('article', other.documentId, priorityThree, {
        version: 1,
        values: { title: 'edited' },
      });
      expect(hidden.status).toBe(404);
      expect((await storedRow(other.documentId))[0]?.title).toBe('p4');
    });
  });

  describe('row-scope and response rules (T21 fix round)', () => {
    it('rolls back an update that moves the row out of the update conditions (403)', async () => {
      const doc = await createArticle(editor, {
        values: { title: 'scoped', priority: 3 },
      });
      const res = await put('article', doc.documentId, priorityThree, {
        version: 1,
        values: { priority: 9, title: 'moved out' },
      });
      expect(res.status).toBe(403);
      const rows = await storedRow(doc.documentId);
      expect(rows[0]?.priority).toBe(3);
      expect(rows[0]?.title).toBe('scoped');
      expect(rows[0]?.version).toBe(1);
    });

    it('rejects conditions on create permissions when a role is saved', async () => {
      const created = await http()
        .post(ROLES)
        .set(bearer(owner))
        .send({ slug: 'bad-create', name: 'bad-create', rank: 30 });
      expect(created.status).toBe(201);
      const res = await http()
        .put(`${ROLES}/${(created.body as { id: string }).id}/permissions`)
        .set(bearer(owner))
        .send({
          permissions: [
            {
              subject: 'article',
              action: 'create',
              conditions: {
                all: [{ field: 'priority', op: 'eq', value: 3 }],
              },
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        'PERMISSION_INVALID_CONDITION',
      );
    });

    it('returns only {documentId, version} when the actor may not read the written row', async () => {
      await customRole('write-not-read', 31, [
        { subject: 'article', action: 'create' },
        {
          subject: 'article',
          action: 'read',
          conditions: { all: [{ field: 'priority', op: 'eq', value: 3 }] },
        },
        { subject: 'article', action: 'update' },
      ]);
      const token = await signedIn('write-not-read');

      const hidden = await post(
        'article',
        token,
        articleBody({
          values: { title: 'p4', priority: 4, body: RAW_BODY },
        }),
      );
      expect(hidden.status).toBe(201);
      expect(Object.keys(hidden.body as Json).sort()).toEqual([
        'documentId',
        'version',
      ]);
      expect((hidden.body as Doc).version).toBe(1);

      const visible = await post('article', token, {
        values: { title: 'p3', priority: 3 },
      });
      expect((visible.body as Doc).values.title).toBe('p3');

      const updated = await put(
        'article',
        (hidden.body as Doc).documentId,
        token,
        { version: 1, values: { title: 'p4 edited' } },
      );
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({
        documentId: (hidden.body as Doc).documentId,
        version: 2,
      });
      expect(JSON.stringify(updated.body)).not.toContain(RAW_BODY);
    });
  });

  describe('field permissions on writes (SPEC D4, §12-4/5)', () => {
    it('drops a resent mask, writes a writable unreadable field, rejects others', async () => {
      const doc = await createArticle(owner);
      const kept = await put('article', doc.documentId, narrow, {
        version: 1,
        values: { title: 'Narrow edit', body: '***' },
      });
      expect(kept.status).toBe(200);
      expect((await storedRow(doc.documentId))[0]?.body).toBe(RAW_BODY);

      const blocked = await put('article', doc.documentId, narrow, {
        version: 2,
        values: { priority: 9 },
      });
      expect(blocked.status).toBe(400);
      expect((blocked.body as Conflict).errorCode).toBe('FIELD_NOT_WRITABLE');

      const written = await put('article', doc.documentId, narrow, {
        version: 2,
        values: { body: '<p>new</p>' },
      });
      expect(written.status).toBe(200);
      expect((await storedRow(doc.documentId))[0]?.body).toBe('<p>new</p>');
    });

    it('a component list needs the whole component writable', async () => {
      const doc = await createArticle(owner);
      const res = await put('article', doc.documentId, narrow, {
        version: 1,
        components: { reference: [] },
      });
      expect(res.status).toBe(400);
    });

    it('the 409 body holds no raw value of a field the actor cannot read', async () => {
      const doc = await createArticle(owner);
      await put('article', doc.documentId, owner, {
        version: 1,
        values: { title: 'Server side' },
      });
      const res = await put('article', doc.documentId, narrow, {
        version: 1,
        values: { title: 'Narrow side', body: '<p>narrow body</p>' },
      });
      expect(res.status).toBe(409);
      const text = JSON.stringify(res.body);
      for (const secret of [RAW_PHONE, RAW_BODY, RAW_META, 'RAW-BODY']) {
        expect(text).not.toContain(secret);
      }
      const body = res.body as Conflict;
      expect(body.details.server?.values.body).toBe('***');
      expect(body.details.server?.values.meta).toBeNull();
      expect(body.details.server?.components.reference).toBeNull();
      expect(body.details.server?.[MASKED_FIELDS_KEY]).toEqual(
        expect.arrayContaining(['body', 'meta', 'reference']),
      );
      expect(body.details.diff.map((d) => d.path)).toEqual(['values.title']);
      expect(body.details.server).not.toHaveProperty('createdBy', undefined);
    });

    it('a conflict hides the server row from an actor whose read conditions exclude it', async () => {
      const doc = await createArticle(owner, {
        values: { title: 'hidden', priority: 4 },
      });
      await put('article', doc.documentId, owner, {
        version: 1,
        values: { title: 'hidden 2' },
      });
      await customRole('read-p3-write-all', 22, [
        {
          subject: 'article',
          action: 'read',
          conditions: { all: [{ field: 'priority', op: 'eq', value: 3 }] },
        },
        { subject: 'article', action: 'update' },
      ]);
      const token = await signedIn('read-p3-write-all');
      const res = await put('article', doc.documentId, token, {
        version: 1,
        values: { title: 'x' },
      });
      expect(res.status).toBe(409);
      const body = res.body as Conflict;
      expect(body.details).toEqual({
        currentVersion: 2,
        server: null,
        submitted: null,
        diff: [],
      });
    });
  });
});

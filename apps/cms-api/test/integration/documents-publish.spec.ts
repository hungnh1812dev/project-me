import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { MASKED_FIELDS_KEY } from '../../src/modules/access/domain/Access.constants';
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

describe('document publish, unpublish and delete (T22; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  let noPublish: string;
  let scopedDelete: string;
  let scopedPublish: string;

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
    await customRole('no-publish', 20, [
      { subject: 'article', action: 'read' },
      { subject: 'article', action: 'update' },
    ]);
    noPublish = await signedIn('no-publish');
    await customRole('scoped-delete', 21, [
      { subject: 'article', action: 'read' },
      { subject: 'article', action: 'create' },
      { subject: 'article', action: 'publish' },
      {
        subject: 'article',
        action: 'delete',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 3 }] },
      },
    ]);
    scopedDelete = await signedIn('scoped-delete');
    await customRole('scoped-publish', 22, [
      { subject: 'article', action: 'read' },
      {
        subject: 'article',
        action: 'publish',
        conditions: { all: [{ field: 'priority', op: 'eq', value: 1 }] },
      },
    ]);
    scopedPublish = await signedIn('scoped-publish');
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
    const email = `t22-user${accountCount}@example.test`;
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

  const publish = (id: string, token: string, expectedVersion: unknown) =>
    http()
      .post(`${DOCUMENTS}/article/${id}/publish`)
      .set(bearer(token))
      .send({ expectedVersion });
  const unpublish = (id: string, token: string) =>
    http().post(`${DOCUMENTS}/article/${id}/unpublish`).set(bearer(token));
  const remove = (slug: string, id: string, token: string) =>
    http().delete(`${DOCUMENTS}/${slug}/${id}`).set(bearer(token));
  const rows = (documentId: string) =>
    content
      .withSchema('content')
      .selectFrom('article')
      .selectAll()
      .where('document_id', '=', documentId)
      .execute();
  const published = async (documentId: string) =>
    (await rows(documentId)).filter((row) => row.published_at !== null);
  const refRows = async (rootId: number) =>
    content
      .withSchema('content')
      .selectFrom('article__reference')
      .selectAll()
      .where('parent_id', '=', rootId)
      .execute();

  describe('publish', () => {
    it('copies the draft tree into a published row with the same uids', async () => {
      const doc = await createArticle();
      const res = await publish(doc.documentId, editor, 1);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ documentId: doc.documentId, version: 1 });
      const all = await rows(doc.documentId);
      expect(all).toHaveLength(2);
      const draft = all.find((row) => row.published_at === null);
      const live = all.find((row) => row.published_at !== null);
      expect(live?.version).toBe(1);
      expect(live?.title).toBe('First');
      expect(live?.id).not.toBe(draft?.id);
      const draftRef = await refRows(draft?.id as number);
      const liveRef = await refRows(live?.id as number);
      expect(liveRef).toHaveLength(1);
      expect(liveRef[0]?.component_uid).toBe(draftRef[0]?.component_uid);
      expect(liveRef[0]?.id).not.toBe(draftRef[0]?.id);
      expect(liveRef[0]?.phone).toBe(RAW_PHONE);

      const read = await http()
        .get(`${DOCUMENTS}/article/${doc.documentId}`)
        .set('X-Forwarded-For', nextIp());
      expect(read.status).toBe(200);
    });

    it('editing the draft afterwards leaves the published tree unchanged', async () => {
      const doc = await createArticle();
      const uid = doc.components.reference?.[0]?.componentUid;
      await publish(doc.documentId, editor, 1);
      const edit = await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Edited' },
        components: {
          reference: [{ componentUid: uid, values: { name: 'Changed' } }],
        },
      });
      expect(edit.status).toBe(200);
      const [live] = await published(doc.documentId);
      expect(live?.title).toBe('First');
      expect((await refRows(live?.id as number))[0]?.name).toBe('Ann');
    });

    it('replaces the existing published row on republish', async () => {
      const doc = await createArticle();
      await publish(doc.documentId, editor, 1);
      await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Second' },
        components: { reference: [] },
      });
      const again = await publish(doc.documentId, editor, 2);
      expect(again.status).toBe(200);
      const live = await published(doc.documentId);
      expect(live).toHaveLength(1);
      expect(live[0]?.title).toBe('Second');
      expect(live[0]?.version).toBe(2);
      expect(await refRows(live[0]?.id as number)).toHaveLength(0);
    });

    it('rejects a stale expectedVersion with 409 and no change', async () => {
      const doc = await createArticle();
      await put('article', doc.documentId, editor, {
        version: 1,
        values: { title: 'Newer' },
      });
      const res = await publish(doc.documentId, editor, 1);
      expect(res.status).toBe(409);
      expect((res.body as Conflict).errorCode).toBe(
        'DOCUMENT_VERSION_CONFLICT',
      );
      expect((res.body as Conflict).details.currentVersion).toBe(2);
      expect(await published(doc.documentId)).toHaveLength(0);
    });

    it('concurrent publishes leave exactly one published row', async () => {
      const doc = await createArticle();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => publish(doc.documentId, editor, 1)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await published(doc.documentId)).toHaveLength(1);
      expect(await rows(doc.documentId)).toHaveLength(2);
    });

    it('is 404 and changes nothing when the published row is outside the publish conditions', async () => {
      const doc = await createArticle(owner);
      await publish(doc.documentId, owner, 1);
      await put('article', doc.documentId, owner, {
        version: 1,
        values: { priority: 1 },
      });
      // Draft (priority 1) matches the conditions below; published (3) does not.
      const res = await publish(doc.documentId, scopedPublish, 2);
      expect(res.status).toBe(404);
      const [live] = await published(doc.documentId);
      expect(live?.version).toBe(1);
      expect(live?.priority).toBe(3);
    });

    it('validates the body and the target', async () => {
      const doc = await createArticle();
      expect((await publish(doc.documentId, editor, undefined)).status).toBe(
        400,
      );
      expect((await publish(doc.documentId, editor, 0)).status).toBe(400);
      const extra = await http()
        .post(`${DOCUMENTS}/article/${doc.documentId}/publish`)
        .set(bearer(editor))
        .send({ expectedVersion: 1, values: {} });
      expect(extra.status).toBe(400);
      expect(
        (await publish('00000000-0000-4000-8000-00000000dead', editor, 1))
          .status,
      ).toBe(404);
      expect((await publish('not-a-uuid', editor, 1)).status).toBe(400);
    });

    it('refuses without the publish permission, anonymous and guest', async () => {
      const doc = await createArticle();
      expect((await publish(doc.documentId, noPublish, 1)).status).toBe(403);
      expect((await publish(doc.documentId, guest, 1)).status).toBe(403);
      const anonymous = await http()
        .post(`${DOCUMENTS}/article/${doc.documentId}/publish`)
        .set('X-Forwarded-For', nextIp())
        .send({ expectedVersion: 1 });
      expect(anonymous.status).toBe(403);
      expect(await published(doc.documentId)).toHaveLength(0);
    });

    it('is a 400 for a type without draft and publish', async () => {
      const note = await post('note', editor, { values: { text: 'x' } });
      const id = (note.body as Doc).documentId;
      const res = await http()
        .post(`${DOCUMENTS}/note/${id}/publish`)
        .set(bearer(editor))
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(400);
      expect((res.body as Conflict).errorCode).toBe('DOCUMENT_NOT_PUBLISHABLE');
    });

    it('lets an API token with publish scope publish', async () => {
      const doc = await createArticle();
      const made = await http()
        .post(TOKENS)
        .set(bearer(owner))
        .send({
          name: 't22',
          scope: { permissions: [{ subject: 'article', action: 'publish' }] },
        });
      const token = (made.body as { token: string }).token;
      expect((await publish(doc.documentId, token, 1)).status).toBe(200);
    });
  });

  describe('unpublish', () => {
    it('deletes the published row and its tree, keeps the draft', async () => {
      const doc = await createArticle();
      await publish(doc.documentId, editor, 1);
      const [live] = await published(doc.documentId);
      const res = await unpublish(doc.documentId, editor);
      expect(res.status).toBe(204);
      expect(await published(doc.documentId)).toHaveLength(0);
      expect(await refRows(live?.id as number)).toHaveLength(0);
      expect(await rows(doc.documentId)).toHaveLength(1);
      const read = await http()
        .get(`${DOCUMENTS}/article/${doc.documentId}`)
        .set('X-Forwarded-For', nextIp());
      expect(read.status).toBe(404);
    });

    it('is 404 when nothing is published and 403 without permission', async () => {
      const doc = await createArticle();
      expect((await unpublish(doc.documentId, editor)).status).toBe(404);
      await publish(doc.documentId, editor, 1);
      expect((await unpublish(doc.documentId, noPublish)).status).toBe(403);
      expect(await published(doc.documentId)).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('removes both rows and the whole tree', async () => {
      const doc = await createArticle(owner);
      await publish(doc.documentId, owner, 1);
      const before = await rows(doc.documentId);
      expect(before).toHaveLength(2);
      const res = await remove('article', doc.documentId, owner);
      expect(res.status).toBe(204);
      expect(await rows(doc.documentId)).toHaveLength(0);
      for (const row of before) {
        expect(await refRows(row.id as number)).toHaveLength(0);
      }
      expect((await remove('article', doc.documentId, owner)).status).toBe(404);
    });

    it('deletes the live row of a type without draft and publish', async () => {
      const note = await post('note', owner, { values: { text: 'x' } });
      const id = (note.body as Doc).documentId;
      expect((await remove('note', id, owner)).status).toBe(204);
      expect((await remove('note', id, owner)).status).toBe(404);
    });

    it('refuses an editor (no delete) and anonymous', async () => {
      const doc = await createArticle();
      expect((await remove('article', doc.documentId, editor)).status).toBe(
        403,
      );
      const anonymous = await http()
        .delete(`${DOCUMENTS}/article/${doc.documentId}`)
        .set('X-Forwarded-For', nextIp());
      expect(anonymous.status).toBe(403);
      expect(await rows(doc.documentId)).toHaveLength(1);
    });

    it('treats rows outside the delete conditions as 404 and deletes nothing', async () => {
      const inScope = await createArticle(owner);
      const outOfScope = await createArticle(
        owner,
        articleBody({ values: { title: 'Other', priority: 1 } }),
      );
      expect(
        (await remove('article', outOfScope.documentId, scopedDelete)).status,
      ).toBe(404);
      expect(await rows(outOfScope.documentId)).toHaveLength(1);
      expect(
        (await remove('article', inScope.documentId, scopedDelete)).status,
      ).toBe(204);

      // Both rows must be inside the conditions: publish, then change the draft out of scope.
      const mixed = await createArticle(owner);
      await publish(mixed.documentId, owner, 1);
      await put('article', mixed.documentId, owner, {
        version: 1,
        values: { priority: 1 },
      });
      expect(
        (await remove('article', mixed.documentId, scopedDelete)).status,
      ).toBe(404);
      expect(await rows(mixed.documentId)).toHaveLength(2);
    });
  });
});

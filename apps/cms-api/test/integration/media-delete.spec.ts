import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { FakeMediaStorage } from '../../src/modules/media/adapters/Fake.adapter';
import { MEDIA_STORAGE } from '../../src/modules/media/application/Media.port';
import {
  MEDIA_PURGE_BATCH_SIZE,
  MEDIA_PURGE_GRACE_MS,
} from '../../src/modules/media/domain/Media.constants';
import { MediaPurgeJob } from '../../src/modules/media/jobs/MediaPurge.job';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/env.fixture';
import { buildMediaFixtures } from '../fixtures/media.fixture';
import { multipart } from '../fixtures/multipart';
import { startPostgres, type TestPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/access.fixture';

const PASSWORD = 'correct horse battery staple';
const MEDIA = '/api/v1/media';
const LOGIN = '/api/v1/auth/login';
const MISSING_ID = '0190a000-0000-7000-8000-000000000000';
const OCTET_RANGE = 250;

const GALLERY = {
  slug: 'gallery',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'cover', type: 'media' },
    {
      name: 'block',
      type: 'component',
      fields: [{ name: 'image', type: 'media' }],
    },
  ],
} as const;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.8.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

describe('media delete and purge (T28; Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let databaseUrl: string;
  let storage: FakeMediaStorage;
  let jpeg: Buffer;
  let accountCount = 0;
  let editor: string;
  let admin: string;
  let guest: string;

  beforeAll(async () => {
    jpeg = (await buildMediaFixtures()).exifJpeg;
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const registry = ContentTypeRegistry.fromDefinitions([GALLERY]);
    await client.query(
      planMigration(emptySnapshot(), [
        registry.resolve('gallery').definition,
      ]).statements.join('\n'),
    );
    await client.end();
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
    storage = app.get<FakeMediaStorage>(MEDIA_STORAGE);
    editor = await signedIn('editor');
    admin = await signedIn('admin');
    guest = await signedIn('guest');
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

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `t28-user${accountCount}@example.test`;
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

  async function uploaded(): Promise<{ id: string; internalId: number }> {
    const { body, contentType } = multipart([
      {
        field: 'file',
        fileName: 'a.jpg',
        data: jpeg,
        contentType: 'image/jpeg',
      },
    ]);
    const res = await http()
      .post(MEDIA)
      .set(bearer(admin))
      .set('Content-Type', contentType)
      .send(body);
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    const row = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { documentId: id },
    });
    return { id, internalId: row.id };
  }

  async function sql(text: string, values: unknown[]): Promise<void> {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(text, values);
    await client.end();
  }

  /** A gallery row (draft or published) whose `cover` is the file. */
  function attachCover(mediaId: number, published: boolean): Promise<void> {
    return sql(
      `insert into content.gallery (document_id, published_at, cover)
       values (gen_random_uuid(), ${published ? 'now()' : 'null'}, $1)`,
      [mediaId],
    );
  }

  const auditRows = () =>
    db.prisma.auditLog.findMany({ where: { action: 'media.deleted' } });

  it('soft-deletes an unreferenced file, hides it and audits it', async () => {
    const { id } = await uploaded();
    const res = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(res.status).toBe(204);
    const row = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { documentId: id },
    });
    expect(row.deletedAt).not.toBeNull();
    const list = await http().get(MEDIA).set(bearer(admin));
    const ids = (list.body as { data: { id: string }[] }).data.map((m) => m.id);
    expect(ids).not.toContain(id);
    const audit = (await auditRows()).filter((entry) => entry.targetId === id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'account',
      subject: 'media',
      metadata: { mimeType: 'image/jpeg' },
    });
    // The stored object is kept until the purge job runs.
    expect(storage.keys()).toContain(row.storageKey);
  });

  it('409 MEDIA_IN_USE for a draft reference and writes no audit', async () => {
    const { id, internalId } = await uploaded();
    await attachCover(internalId, false);
    const res = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(res.status).toBe(409);
    expect((res.body as { errorCode: string }).errorCode).toBe('MEDIA_IN_USE');
    const row = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { documentId: id },
    });
    expect(row.deletedAt).toBeNull();
    expect((await auditRows()).some((entry) => entry.targetId === id)).toBe(
      false,
    );
  });

  it('409 MEDIA_IN_USE for a published reference', async () => {
    const { id, internalId } = await uploaded();
    await attachCover(internalId, true);
    const res = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(res.status).toBe(409);
    expect((res.body as { errorCode: string }).errorCode).toBe('MEDIA_IN_USE');
  });

  it('409 MEDIA_IN_USE for a reference inside a component', async () => {
    const { id, internalId } = await uploaded();
    await sql(
      `with parent as (
         insert into content.gallery (document_id) values (gen_random_uuid()) returning id)
       insert into content.gallery__block (component_uid, parent_id, image)
       select gen_random_uuid(), id, $1 from parent`,
      [internalId],
    );
    const res = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(res.status).toBe(409);
  });

  it('deletes once the last reference is gone', async () => {
    const { id, internalId } = await uploaded();
    await attachCover(internalId, false);
    expect(
      (await http().delete(`${MEDIA}/${id}`).set(bearer(admin))).status,
    ).toBe(409);
    await sql('update content.gallery set cover = null where cover = $1', [
      internalId,
    ]);
    expect(
      (await http().delete(`${MEDIA}/${id}`).set(bearer(admin))).status,
    ).toBe(204);
  });

  it('404 for an unknown, already deleted or malformed id', async () => {
    const { id } = await uploaded();
    await http().delete(`${MEDIA}/${id}`).set(bearer(admin)).expect(204);
    const again = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(again.status).toBe(404);
    expect((again.body as { errorCode: string }).errorCode).toBe(
      'MEDIA_NOT_FOUND',
    );
    await http()
      .delete(`${MEDIA}/${MISSING_ID}`)
      .set(bearer(admin))
      .expect(404);
    await http().delete(`${MEDIA}/not-a-uuid`).set(bearer(admin)).expect(400);
  });

  it('401 without a session, 403 without media:delete', async () => {
    const { id } = await uploaded();
    await http().delete(`${MEDIA}/${id}`).expect(401);
    // editor has media read/create/update only; guest has nothing
    await http().delete(`${MEDIA}/${id}`).set(bearer(editor)).expect(403);
    await http().delete(`${MEDIA}/${id}`).set(bearer(guest)).expect(403);
    const row = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { documentId: id },
    });
    expect(row.deletedAt).toBeNull();
  });

  describe('purge job', () => {
    const job = () => app.get(MediaPurgeJob);

    async function softDelete(id: string, ageMs: number): Promise<void> {
      await db.prisma.fileLibrary.update({
        where: { documentId: id },
        data: { deletedAt: new Date(Date.now() - ageMs) },
      });
    }

    it('removes the object and row of files deleted over 24 h ago only', async () => {
      const old = await uploaded();
      const recent = await uploaded();
      const live = await uploaded();
      await softDelete(old.id, MEDIA_PURGE_GRACE_MS + 60_000);
      await softDelete(recent.id, MEDIA_PURGE_GRACE_MS - 60_000);
      const keyOf = async (id: string) =>
        (
          await db.prisma.fileLibrary.findUniqueOrThrow({
            where: { documentId: id },
          })
        ).storageKey;
      const oldKey = await keyOf(old.id);
      const recentKey = await keyOf(recent.id);
      const liveKey = await keyOf(live.id);

      const result = await job().run();
      expect(result.purged).toBeGreaterThanOrEqual(1);
      expect(storage.keys()).not.toContain(oldKey);
      expect(storage.keys()).toContain(recentKey);
      expect(storage.keys()).toContain(liveKey);
      expect(
        await db.prisma.fileLibrary.findUnique({
          where: { documentId: old.id },
        }),
      ).toBeNull();
      expect(
        await db.prisma.fileLibrary.findUnique({
          where: { documentId: recent.id },
        }),
      ).not.toBeNull();
    });

    it('keeps a file that a document points at again', async () => {
      const file = await uploaded();
      await softDelete(file.id, MEDIA_PURGE_GRACE_MS + 60_000);
      await attachCover(file.internalId, false);
      const row = await db.prisma.fileLibrary.findUniqueOrThrow({
        where: { documentId: file.id },
      });
      const result = await job().run();
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      expect(storage.keys()).toContain(row.storageKey);
      expect(
        await db.prisma.fileLibrary.findUnique({
          where: { documentId: file.id },
        }),
      ).not.toBeNull();
    });

    it('purges a row behind more skipped rows than one batch', async () => {
      const old = new Date(Date.now() - MEDIA_PURGE_GRACE_MS - 60_000);
      const base = {
        fileName: 'bulk.jpg',
        mimeType: 'image/jpeg',
        size: 1,
        sha256: 'x',
        url: 'u',
        provider: 'cloudinary' as const,
        deletedAt: old,
      };
      const ids: number[] = [];
      for (let i = 0; i < MEDIA_PURGE_BATCH_SIZE + 1; i += 1) {
        const row = await db.prisma.fileLibrary.create({
          data: { ...base, storageKey: `bulk-skipped-${i}` },
        });
        ids.push(row.id);
      }
      await sql(
        `insert into content.gallery (document_id, cover)
         select gen_random_uuid(), unnest($1::int[])`,
        [ids],
      );
      const last = await db.prisma.fileLibrary.create({
        data: { ...base, storageKey: 'bulk-purgeable' },
      });
      const result = await job().run();
      expect(result.skipped).toBeGreaterThanOrEqual(ids.length);
      expect(
        await db.prisma.fileLibrary.findUnique({ where: { id: last.id } }),
      ).toBeNull();
    });
  });
});

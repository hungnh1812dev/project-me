import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
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
  MEDIA_PURGE_GRACE_MS,
  PRESET_MEDIA_PROVIDER,
} from '../../src/modules/media/domain/Media.constants';
import { MediaPurgeJob } from '../../src/modules/media/jobs/MediaPurge.job';
import { seedRolePermissions, seedSystemRoles } from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/Env.fixture';
import { buildMediaFixtures, MINIMAL_PDF } from '../fixtures/Media.fixture';
import { multipart } from '../fixtures/Multipart.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const PASSWORD = 'correct horse battery staple';
const MEDIA = '/api/v1/media';
const LOGIN = '/api/v1/auth/login';
const MISSING_ID = '0190a000-0000-7000-8000-000000000000';
const OCTET_RANGE = 250;

const GALLERY = {
  slug: 'gallery',
  displayName: 'Gallery',
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

describe('media replace in place (UIL-2; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let databaseUrl: string;
  let storage: FakeMediaStorage;
  let jpeg: Buffer;
  let png: Buffer;
  let accountCount = 0;
  let editor: string;
  let admin: string;
  let guest: string;

  beforeAll(async () => {
    const fixtures = await buildMediaFixtures();
    jpeg = fixtures.exifJpeg;
    png = fixtures.png;
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
      planMigration(emptySnapshot(), [registry.resolve('gallery').definition]).statements.join(
        '\n',
      ),
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
    const email = `uil2-user${accountCount}@example.test`;
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

  const imagePart = (data: Buffer, fileName: string, contentType: string) => ({
    field: 'file',
    fileName,
    data,
    contentType,
  });

  function replace(token: string, id: string, parts: Parameters<typeof multipart>[0]) {
    const { body: payload, contentType } = multipart(parts);
    return http()
      .put(`${MEDIA}/${id}/file`)
      .set(bearer(token))
      .set('Content-Type', contentType)
      .send(payload);
  }

  const rowOf = (id: string) =>
    db.prisma.fileLibrary.findUniqueOrThrow({ where: { documentId: id } });

  it('200 keeps id, alt and creator, swaps the bytes and leaves a tombstone with the old key', async () => {
    const { id } = await uploaded();
    await http().patch(`${MEDIA}/${id}`).set(bearer(admin)).send({ alt: 'A door' }).expect(200);
    const before = await rowOf(id);
    const res = await replace(editor, id, [imagePart(png, 'fresh.png', 'image/png')]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      alt: 'A door',
      fileName: 'fresh.png',
      mimeType: 'image/png',
    });
    expect(res.body).not.toHaveProperty('storageKey');
    const after = await rowOf(id);
    expect(after.id).toBe(before.id);
    expect(after.createdById).toBe(before.createdById);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.storageKey).not.toBe(before.storageKey);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.url).not.toBe(before.url);
    expect(after.updatedById).not.toBe(before.updatedById);
    const tombstone = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { storageKey: before.storageKey },
    });
    expect(tombstone.id).not.toBe(before.id);
    expect(tombstone.deletedAt).not.toBeNull();
    expect(tombstone.sha256).toBe(before.sha256);
    expect(storage.keys()).toEqual(expect.arrayContaining([before.storageKey, after.storageKey]));
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: { action: 'media.replaced', targetId: id },
    });
    expect(audit.metadata).toEqual({ previousSha256: before.sha256, sha256: after.sha256 });
  });

  it('accepts the local provider value the migration added', async () => {
    const { id } = await uploaded();
    const row = await rowOf(id);
    const updated = await db.prisma.fileLibrary.update({
      where: { id: row.id },
      data: { provider: 'local' },
    });
    expect(updated.provider).toBe('local');
  });

  it('replaces a reviewer preset row: the live row reads the active provider, the tombstone keeps preset, and purge never deletes the preset key', async () => {
    const { id } = await uploaded();
    const before = await rowOf(id);
    await db.prisma.fileLibrary.update({
      where: { id: before.id },
      data: { provider: PRESET_MEDIA_PROVIDER, isReviewerPreset: true },
    });
    const res = await replace(editor, id, [imagePart(png, 'fresh.png', 'image/png')]);
    expect(res.status).toBe(200);
    const after = await rowOf(id);
    expect(after.provider).toBe('cloudinary');
    expect(after.isReviewerPreset).toBe(true);
    const tombstone = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { storageKey: before.storageKey },
    });
    expect(tombstone.provider).toBe(PRESET_MEDIA_PROVIDER);

    await db.prisma.fileLibrary.update({
      where: { id: tombstone.id },
      data: { deletedAt: new Date(Date.now() - MEDIA_PURGE_GRACE_MS - 60_000) },
    });
    const deleteSpy = jest.spyOn(storage, 'delete');
    await app.get(MediaPurgeJob).run();
    expect(deleteSpy).not.toHaveBeenCalledWith(before.storageKey, expect.anything());
    expect(
      await db.prisma.fileLibrary.findUnique({ where: { storageKey: before.storageKey } }),
    ).toBeNull();
    deleteSpy.mockRestore();
  });

  it('400 for another family or an extra part, and the row stays as it was', async () => {
    const { id } = await uploaded();
    const before = await rowOf(id);
    const keysBefore = storage.keys().length;
    const pdf = await replace(editor, id, [imagePart(MINIMAL_PDF, 'a.pdf', 'application/pdf')]);
    expect(pdf.status).toBe(400);
    const withAlt = await replace(editor, id, [
      { field: 'alt', value: 'nope' },
      imagePart(png, 'x.png', 'image/png'),
    ]);
    expect(withAlt.status).toBe(400);
    const twoFiles = await replace(editor, id, [
      imagePart(png, 'x.png', 'image/png'),
      { field: 'other', fileName: 'y.png', data: png },
    ]);
    expect(twoFiles.status).toBe(400);
    expect(await rowOf(id)).toEqual(before);
    expect(storage.keys()).toHaveLength(keysBefore);
  });

  it('403 without media:update, 401 without a session', async () => {
    const { id } = await uploaded();
    expect((await replace(guest, id, [imagePart(png, 'x.png', 'image/png')])).status).toBe(403);
    await http().put(`${MEDIA}/${id}/file`).expect(401);
  });

  it('404 for an unknown or soft-deleted file', async () => {
    const { id } = await uploaded();
    await db.prisma.fileLibrary.update({
      where: { documentId: id },
      data: { deletedAt: new Date() },
    });
    const part = [imagePart(png, 'x.png', 'image/png')];
    expect((await replace(editor, id, part)).status).toBe(404);
    expect((await replace(editor, MISSING_ID, part)).status).toBe(404);
    await http().put(`${MEDIA}/nope/file`).set(bearer(editor)).expect(400);
  });

  it('shares the throttle counters with POST /media', async () => {
    const token = await signedIn('editor');
    const fixedIp = { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '10.99.0.1' };
    const half = 30;
    for (let i = 0; i < half; i += 1) {
      await http().post(MEDIA).set(fixedIp).expect(415);
      await http().put(`${MEDIA}/${MISSING_ID}/file`).set(fixedIp).expect(404);
    }
    const blocked = await http().put(`${MEDIA}/${MISSING_ID}/file`).set(fixedIp);
    expect(blocked.status).toBe(429);
  });

  it('the purge job removes the old object after the grace time and a document gets the new url', async () => {
    const { id, internalId } = await uploaded();
    const before = await rowOf(id);
    await replace(editor, id, [imagePart(png, 'fresh.png', 'image/png')]).expect(200);
    const created = await http()
      .post('/api/v1/documents/gallery')
      .set(bearer(editor))
      .send({ values: { cover: id } });
    expect(created.status).toBe(201);
    const cover = (created.body as { values: { cover: { url: string } } }).values.cover;
    expect(cover.url).toBe((await rowOf(id)).url);
    expect(cover.url).not.toBe(before.url);
    expect(internalId).toBe((await rowOf(id)).id);

    await db.prisma.fileLibrary.update({
      where: { storageKey: before.storageKey },
      data: { deletedAt: new Date(Date.now() - MEDIA_PURGE_GRACE_MS - 60_000) },
    });
    await app.get(MediaPurgeJob).run();
    expect(storage.keys()).not.toContain(before.storageKey);
    expect(storage.keys()).toContain((await rowOf(id)).storageKey);
    expect(
      await db.prisma.fileLibrary.findUnique({ where: { storageKey: before.storageKey } }),
    ).toBeNull();
  });
});

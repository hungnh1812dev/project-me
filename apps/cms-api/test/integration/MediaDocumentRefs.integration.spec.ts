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
    { name: 'body', type: 'richtext' },
    {
      name: 'block',
      type: 'component',
      fields: [
        { name: 'image', type: 'media' },
        { name: 'caption', type: 'richtext' },
      ],
    },
  ],
} as const;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.8.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

describe('document media references (T29; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let databaseUrl: string;
  let jpeg: Buffer;
  let png: Buffer;
  let accountCount = 0;
  let editor: string;
  let admin: string;
  let owner: string;
  let noMediaReadWriter: string;

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
    editor = await signedIn('editor');
    admin = await signedIn('admin');
    owner = await signedIn('owner');
    const gallery = (action: string) => ({ subject: 'gallery', action });
    await customRole('no-media-writer', 21, [
      gallery('read'),
      gallery('create'),
      gallery('update'),
    ]);
    noMediaReadWriter = await signedIn('no-media-writer');
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
    const email = `t29-user${accountCount}@example.test`;
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

  async function customRole(slug: string, rank: number, permissions: unknown[]) {
    const created = await http()
      .post('/api/v1/roles')
      .set(bearer(owner))
      .send({ slug, name: slug, rank });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const put = await http()
      .put(`/api/v1/roles/${id}/permissions`)
      .set(bearer(owner))
      .send({ permissions });
    if (put.status !== 200) throw new Error(JSON.stringify(put.body));
  }

  async function uploaded(
    part: { fileName: string; data: Buffer; contentType: string } = {
      fileName: 'a.jpg',
      data: jpeg,
      contentType: 'image/jpeg',
    },
  ): Promise<{ id: string; internalId: number; url: string }> {
    const { body, contentType } = multipart([{ field: 'file', ...part }]);
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
    return { id, internalId: row.id, url: row.url };
  }

  const DOCS = '/api/v1/documents/gallery';
  const FILE_KEYS = [
    'id',
    'fileName',
    'mimeType',
    'url',
    'thumbnailUrl',
    'provider',
    'alt',
    'size',
    'width',
    'height',
    'sha256',
    'createdAt',
    'updatedAt',
  ];

  interface Doc {
    documentId: string;
    version: number;
    values: { cover: Record<string, unknown> | null; body?: string };
    components: {
      block: { values: { image: Record<string, unknown> | null; caption?: string } }[];
    };
  }

  it('attaches by uuid, stores the internal id, embeds the file on every read', async () => {
    const { id, internalId } = await uploaded();
    const created = await http()
      .post(DOCS)
      .set(bearer(editor))
      .send({
        values: { cover: id },
        components: { block: [{ values: { image: id } }] },
      });
    expect(created.status).toBe(201);
    const doc = created.body as Doc;
    expect(Object.keys(doc.values.cover ?? {}).sort()).toEqual([...FILE_KEYS].sort());
    expect(doc.values.cover).toMatchObject({ id, provider: 'cloudinary' });
    expect(doc.components.block[0]?.values.image).toMatchObject({ id });
    const stored = await db.prisma.$queryRawUnsafe<{ cover: number }[]>(
      'select cover from content.gallery where document_id = $1::uuid',
      doc.documentId,
    );
    expect(stored[0]?.cover).toBe(internalId);
    const detail = await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor));
    expect((detail.body as Doc).values.cover).toMatchObject({ id });
    const list = await http().get(`${DOCS}?status=draft`).set(bearer(editor));
    expect(JSON.stringify(list.body)).not.toContain(`"cover":${internalId}`);
  });

  it('keeps MEDIA_IN_USE working for attached files', async () => {
    const { id } = await uploaded();
    await http()
      .post(DOCS)
      .set(bearer(editor))
      .send({ values: { cover: id } })
      .expect(201);
    const res = await http().delete(`${MEDIA}/${id}`).set(bearer(admin));
    expect(res.status).toBe(409);
    expect((res.body as { errorCode: string }).errorCode).toBe('MEDIA_IN_USE');
  });

  it('400 for an integer, an unknown, a deleted or a malformed reference', async () => {
    const { id, internalId } = await uploaded();
    const gone = await uploaded();
    await http().delete(`${MEDIA}/${gone.id}`).set(bearer(admin)).expect(204);
    for (const cover of [internalId, MISSING_ID, gone.id, 'nope']) {
      const res = await http().post(DOCS).set(bearer(editor)).send({ values: { cover } });
      expect(res.status).toBe(400);
      expect((res.body as { errorCode: string }).errorCode).toBe('DOCUMENT_INVALID');
    }
    expect(id).toBeDefined();
  });

  it('a discard frees a file only the discarded edit used and keeps the published one in use', async () => {
    const published = await uploaded();
    const draftOnly = await uploaded();
    const doc = (
      await http()
        .post(DOCS)
        .set(bearer(editor))
        .send({ values: { cover: published.id } })
    ).body as Doc;
    await http()
      .post(`${DOCS}/${doc.documentId}/publish`)
      .set(bearer(editor))
      .send({ expectedVersion: 1 })
      .expect(200);
    await http()
      .put(`${DOCS}/${doc.documentId}`)
      .set(bearer(editor))
      .send({ version: 1, values: { cover: draftOnly.id } })
      .expect(200);
    const inUse = await http().delete(`${MEDIA}/${draftOnly.id}`).set(bearer(admin));
    expect(inUse.status).toBe(409);

    await http()
      .post(`${DOCS}/${doc.documentId}/discard`)
      .set(bearer(editor))
      .send({ expectedVersion: 2 })
      .expect(200);
    const draft = (await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor)))
      .body as Doc;
    expect(draft.values.cover).toMatchObject({ id: published.id });
    expect((await http().delete(`${MEDIA}/${published.id}`).set(bearer(admin))).status).toBe(409);
    expect((await http().delete(`${MEDIA}/${draftOnly.id}`).set(bearer(admin))).status).toBe(204);
  });

  it('updates and clears the reference; null stays null', async () => {
    const first = await uploaded();
    const second = await uploaded();
    const doc = (
      await http()
        .post(DOCS)
        .set(bearer(editor))
        .send({ values: { cover: first.id } })
    ).body as Doc;
    const moved = await http()
      .put(`${DOCS}/${doc.documentId}`)
      .set(bearer(editor))
      .send({ version: doc.version, values: { cover: second.id } });
    expect(moved.status).toBe(200);
    expect((moved.body as Doc).values.cover).toMatchObject({ id: second.id });
    const cleared = await http()
      .put(`${DOCS}/${doc.documentId}`)
      .set(bearer(editor))
      .send({ version: 2, values: { cover: null } });
    expect((cleared.body as Doc).values.cover).toBeNull();
  });

  it('embeds the file on both sides of a 409', async () => {
    const first = await uploaded();
    const second = await uploaded();
    const doc = (
      await http()
        .post(DOCS)
        .set(bearer(editor))
        .send({ values: { cover: first.id } })
    ).body as Doc;
    await http()
      .put(`${DOCS}/${doc.documentId}`)
      .set(bearer(editor))
      .send({ version: 1, values: { cover: first.id } })
      .expect(200);
    const stale = await http()
      .put(`${DOCS}/${doc.documentId}`)
      .set(bearer(editor))
      .send({ version: 1, values: { cover: second.id } });
    expect(stale.status).toBe(409);
    const details = (
      stale.body as {
        details: { server: Doc; submitted: Doc };
      }
    ).details;
    expect(details.server.values.cover).toMatchObject({ id: first.id });
    expect(details.submitted.values.cover).toMatchObject({ id: second.id });
  });

  const imgOf = (file: { id: string; url: string }, extra = '') =>
    `<img src="${file.url}"${extra} data-media-id="${file.id}" />`;

  describe('richtext images', () => {
    const createWithBody = async (body: string, caption = '<p>c</p>') =>
      (
        await http()
          .post(DOCS)
          .set(bearer(editor))
          .send({ values: { body }, components: { block: [{ values: { caption } }] } })
          .expect(201)
      ).body as Doc;

    describe('richtext image ids follow the media field write rule', () => {
      const writeBody = (token: string, body: string, documentId?: string) =>
        documentId === undefined
          ? http().post(DOCS).set(bearer(token)).send({ values: { body } })
          : http()
              .put(`${DOCS}/${documentId}`)
              .set(bearer(token))
              .send({ values: { body }, version: 1 });
      const bulkCreate = (token: string, bodies: string[]) =>
        http()
          .post(`${DOCS}/bulk/create`)
          .set(bearer(token))
          .send({ atomic: true, items: bodies.map((body) => ({ values: { body } })) });
      const galleryCount = async () => {
        const rows = await db.prisma.$queryRawUnsafe<{ n: bigint }[]>(
          'select count(*)::bigint as n from content.gallery',
        );
        return Number(rows[0]?.n);
      };

      it('400 with the field path, nothing stored, when media:read is denied to the writer', async () => {
        const file = await uploaded();
        const before = await galleryCount();
        const res = await writeBody(noMediaReadWriter, imgOf(file));
        expect(res.status).toBe(400);
        expect((res.body as { errorCode: string }).errorCode).toBe('DOCUMENT_INVALID');
        expect(JSON.stringify(res.body)).toContain('body');
        const component = await http()
          .post(DOCS)
          .set(bearer(noMediaReadWriter))
          .send({ values: {}, components: { block: [{ values: { caption: imgOf(file) } }] } });
        expect(component.status).toBe(400);
        expect(JSON.stringify(component.body)).toContain('caption');
        expect(await galleryCount()).toBe(before);
      });

      it('400 for an unknown or deleted file id, on create and on update', async () => {
        const gone = await uploaded();
        await http().delete(`${MEDIA}/${gone.id}`).set(bearer(admin)).expect(204);
        const ok = await uploaded();
        const created = (await createWithBody(imgOf(ok))).documentId;
        for (const id of [MISSING_ID, gone.id]) {
          const html = `<img src="${ok.url}" data-media-id="${id}" />`;
          expect((await writeBody(editor, html)).status).toBe(400);
          expect((await writeBody(editor, html, created)).status).toBe(400);
        }
      });

      it('succeeds for a readable file and stores the richtext unchanged', async () => {
        const file = await uploaded();
        const res = await writeBody(noMediaReadWriter, '<p>no image</p>');
        expect(res.status).toBe(201);
        const doc = await createWithBody(imgOf(file));
        const row = await db.prisma.$queryRawUnsafe<{ body: string }[]>(
          'select body from content.gallery where document_id = $1::uuid',
          doc.documentId,
        );
        expect(row[0]?.body).toContain(`data-media-id="${file.id}"`);
      });

      it('bulk create answers 400 for an unreadable richtext image and stores nothing', async () => {
        const file = await uploaded();
        const before = await galleryCount();
        const res = await bulkCreate(noMediaReadWriter, ['<p>a</p>', imgOf(file)]);
        expect(res.status).toBe(400);
        expect(await galleryCount()).toBe(before);
        const readable = await bulkCreate(editor, ['<p>a</p>', imgOf(file)]);
        expect(readable.status).toBe(200);
      });

      it('a refused write does not block deleting the file', async () => {
        const file = await uploaded();
        expect((await writeBody(noMediaReadWriter, imgOf(file))).status).toBe(400);
        await http().delete(`${MEDIA}/${file.id}`).set(bearer(admin)).expect(204);
      });
    });

    it('409 MEDIA_IN_USE when only a root richtext uses the file (draft counts)', async () => {
      const file = await uploaded();
      await createWithBody(`<p>x</p>${imgOf(file)}`);
      const res = await http().delete(`${MEDIA}/${file.id}`).set(bearer(admin));
      expect(res.status).toBe(409);
      expect((res.body as { errorCode: string }).errorCode).toBe('MEDIA_IN_USE');
    });

    it('409 MEDIA_IN_USE when only a component richtext uses the file', async () => {
      const file = await uploaded();
      await createWithBody('<p>x</p>', imgOf(file));
      const res = await http().delete(`${MEDIA}/${file.id}`).set(bearer(admin));
      expect(res.status).toBe(409);
      expect((res.body as { errorCode: string }).errorCode).toBe('MEDIA_IN_USE');
    });

    it('a file no richtext or media field uses can still be deleted', async () => {
      const used = await uploaded();
      const free = await uploaded();
      await createWithBody(imgOf(used));
      const res = await http().delete(`${MEDIA}/${free.id}`).set(bearer(admin));
      expect(res.status).toBe(204);
    });

    it('text that only looks like the image marker is not a reference', async () => {
      const file = await uploaded();
      await createWithBody(`<p>data-media-id="${file.id}"</p>`);
      const res = await http().delete(`${MEDIA}/${file.id}`).set(bearer(admin));
      expect(res.status).toBe(204);
    });

    it('a malformed stored media id does not break reads', async () => {
      const doc = await createWithBody('<p>a</p>');
      await db.prisma.$executeRawUnsafe(
        'update content.gallery set body = $1 where document_id = $2::uuid',
        '<p>a</p><img src="x" data-media-id="not-a-uuid" />',
        doc.documentId,
      );
      const detail = await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor));
      expect(detail.status).toBe(200);
      expect((detail.body as Doc).values.body).toBe('<p>a</p>');
    });

    it('reads show the current url after the file is replaced', async () => {
      const file = await uploaded();
      const doc = await createWithBody(imgOf(file, ' alt="cat"'), imgOf(file));
      const { body, contentType } = multipart([
        { field: 'file', fileName: 'fresh.png', data: png, contentType: 'image/png' },
      ]);
      await http()
        .put(`${MEDIA}/${file.id}/file`)
        .set(bearer(editor))
        .set('Content-Type', contentType)
        .send(body)
        .expect(200);
      const fresh = await db.prisma.fileLibrary.findUniqueOrThrow({
        where: { documentId: file.id },
      });
      expect(fresh.url).not.toBe(file.url);
      const detail = (
        await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor))
      ).body as Doc;
      expect(detail.values.body).toBe(
        `<img src="${fresh.url}" alt="cat" data-media-id="${file.id}" />`,
      );
      expect(detail.components.block[0]?.values.caption).toBe(imgOf({ ...file, url: fresh.url }));
      const list = await http().get(`${DOCS}?status=draft`).set(bearer(editor));
      expect(JSON.stringify(list.body)).toContain(fresh.url);
      expect(JSON.stringify(list.body)).not.toContain(file.url);
    });

    it('the image is gone from reads once the file is deleted', async () => {
      const file = await uploaded();
      const doc = await createWithBody(`<p>a</p>${imgOf(file)}<p>b</p>`);
      await db.prisma.fileLibrary.update({
        where: { documentId: file.id },
        data: { deletedAt: new Date() },
      });
      const detail = (
        await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor))
      ).body as Doc;
      expect(detail.values.body).toBe('<p>a</p><p>b</p>');
    });

    it('a non-image file id is removed from reads', async () => {
      const pdf = await uploaded({
        fileName: 'a.pdf',
        data: MINIMAL_PDF,
        contentType: 'application/pdf',
      });
      const image = await uploaded();
      const doc = await createWithBody('<p>a</p>');
      await db.prisma.$executeRawUnsafe(
        'update content.gallery set body = $1 where document_id = $2::uuid',
        `${imgOf(pdf)}${imgOf(image)}`,
        doc.documentId,
      );
      const detail = (
        await http().get(`${DOCS}/${doc.documentId}?status=draft`).set(bearer(editor))
      ).body as Doc;
      expect(detail.values.body).toBe(imgOf(image));
    });
  });

  it('rejects filtering and sorting on a media field (internal id stays private)', async () => {
    const { id } = await uploaded();
    for (const query of [
      '?filter[cover][eq]=1',
      `?filter[cover][eq]=${id}`,
      '?filter[cover][in]=1,2',
      '?sort=cover',
      '?sort=-cover',
    ]) {
      const res = await http().get(`${DOCS}${query}&status=draft`).set(bearer(editor));
      expect(res.status).toBe(400);
    }
  });
});

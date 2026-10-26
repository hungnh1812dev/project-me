import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createHash } from 'node:crypto';
import request from 'supertest';

import { PermissionAction } from '../../src/generated/prisma/client';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { reviewerActor } from '../../src/modules/access/domain/ActorContext.entity';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { MEDIA_MAX_BYTES } from '../../src/modules/media/domain/MediaUpload.rules';
import { FakeMediaStorage } from '../../src/modules/media/adapters/Fake.adapter';
import { MEDIA_STORAGE } from '../../src/modules/media/application/Media.port';
import { MediaLibraryService } from '../../src/modules/media/application/MediaLibrary.service';
import {
  ARTICLE_DEFINITION,
  grant,
  systemRole,
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
import {
  buildMediaFixtures,
  EXIF_MARKER,
  HTML_DOCUMENT,
  type MediaFixtures,
  MINIMAL_MP4,
  MINIMAL_PDF,
  SVG_DOCUMENT,
} from '../fixtures/media.fixture';
import { multipart } from '../fixtures/multipart';
import { startPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/access.fixture';

const PASSWORD = 'correct horse battery staple';
const MEDIA = '/api/v1/media';
const LOGIN = '/api/v1/auth/login';
const ROLES = '/api/v1/roles';
const OCTET_RANGE = 250;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.7.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

interface MediaBody {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
  thumbnailUrl: string | null;
  isReviewerPreset: boolean;
  createdAt: string;
}
interface Page {
  data: MediaBody[];
  meta: { page: number; pageSize: number; total: number };
}
interface ErrorBody {
  statusCode: number;
  errorCode: string;
}

describe('media upload and list (T27; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let storage: FakeMediaStorage;
  let fixtures: MediaFixtures;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  let readOnly: string;

  beforeAll(async () => {
    fixtures = await buildMediaFixtures();
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION]);
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
    owner = await signedIn('owner');
    editor = await signedIn('editor');
    guest = await signedIn('guest');
    const role = await http()
      .post(ROLES)
      .set(bearer(owner))
      .send({ slug: 'media-reader', name: 'media-reader', rank: 20 });
    const roleId = (role.body as { id: string }).id;
    const put = await http()
      .put(`${ROLES}/${roleId}/permissions`)
      .set(bearer(owner))
      .send({ permissions: [{ subject: 'media', action: 'read' }] });
    if (put.status !== 200) throw new Error('could not set up the role');
    readOnly = await signedIn('media-reader');
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
    const email = `t27-user${accountCount}@example.test`;
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

  function upload(
    token: string | undefined,
    data: Buffer,
    fileName = 'photo.jpg',
    extra: { field: string; value: string }[] = [],
  ) {
    const { body, contentType } = multipart([
      ...extra,
      { field: 'file', fileName, data, contentType: 'image/jpeg' },
    ]);
    const req = http()
      .post(MEDIA)
      .set('X-Forwarded-For', nextIp())
      .set('Content-Type', contentType);
    return (
      token === undefined ? req : req.set('Authorization', `Bearer ${token}`)
    ).send(body);
  }

  describe('POST /media', () => {
    it('stores a re-encoded JPEG without EXIF and records the row', async () => {
      const res = await upload(editor, fixtures.exifJpeg, 'holiday.jpg', [
        { field: 'alt', value: 'A red box' },
      ]);
      expect(res.status).toBe(201);
      const body = res.body as MediaBody;
      expect(Object.keys(body).sort()).toEqual([
        'alt',
        'createdAt',
        'fileName',
        'height',
        'id',
        'isReviewerPreset',
        'mimeType',
        'provider',
        'size',
        'thumbnailUrl',
        'url',
        'width',
      ]);
      expect(body).toMatchObject({
        fileName: 'holiday.jpg',
        mimeType: 'image/jpeg',
        alt: 'A red box',
        width: 8,
        height: 4,
        isReviewerPreset: false,
      });
      expect(body.thumbnailUrl).not.toBeNull();

      const row = await db.prisma.fileLibrary.findUniqueOrThrow({
        where: { documentId: body.id },
        include: { createdBy: { select: { email: true } } },
      });
      expect(row.storageKey).toMatch(UUID_V7_PATTERN);
      expect(row.provider).toBe('cloudinary');
      expect(row.createdBy?.email).toMatch(/^t27-user/);
      const stored = storage.get(row.storageKey);
      expect(stored?.bytes.includes(Buffer.from(EXIF_MARKER))).toBe(false);
      expect(row.sha256).toBe(
        createHash('sha256')
          .update(stored?.bytes ?? Buffer.alloc(0))
          .digest('hex'),
      );
      expect(row.size).toBe(stored?.bytes.length);
      expect(row.url).toContain(row.storageKey);
    });

    it('accepts pdf and mp4 as they are, without a thumbnail', async () => {
      const pdf = await upload(editor, MINIMAL_PDF, 'cv.pdf');
      expect(pdf.status).toBe(201);
      expect(pdf.body).toMatchObject({
        mimeType: 'application/pdf',
        thumbnailUrl: null,
        width: null,
      });
      const mp4 = await upload(editor, MINIMAL_MP4, 'clip.mp4');
      expect(mp4.status).toBe(201);
      expect(mp4.body).toMatchObject({ mimeType: 'video/mp4' });
    });

    it('re-encodes a polyglot JPEG so the appended HTML is gone', async () => {
      const res = await upload(editor, fixtures.polyglotJpeg);
      expect(res.status).toBe(201);
      const row = await db.prisma.fileLibrary.findUniqueOrThrow({
        where: { documentId: (res.body as MediaBody).id },
      });
      expect(
        storage.get(row.storageKey)?.bytes.includes(Buffer.from('<script>')),
      ).toBe(false);
    });

    it.each([
      ['html renamed to .jpg', HTML_DOCUMENT, 'a.jpg'],
      ['svg', SVG_DOCUMENT, 'a.svg'],
      ['svg renamed to .png', SVG_DOCUMENT, 'a.png'],
      [
        'a jpeg that does not decode',
        Buffer.concat([
          Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
          Buffer.alloc(64, 0x41),
        ]),
        'a.jpg',
      ],
    ])('is 415 for %s and stores nothing', async (_name, data, fileName) => {
      const before = storage.keys().length;
      const rows = await db.prisma.fileLibrary.count();
      const res = await upload(editor, data, fileName);
      expect(res.status).toBe(415);
      expect((res.body as ErrorBody).errorCode).toBe('MEDIA_UNSUPPORTED_TYPE');
      expect(storage.keys()).toHaveLength(before);
      expect(await db.prisma.fileLibrary.count()).toBe(rows);
    });

    it('is 413 for a pdf over its limit', async () => {
      const big = Buffer.concat([
        MINIMAL_PDF,
        Buffer.alloc(MEDIA_MAX_BYTES.pdf, 0x20),
      ]);
      const res = await upload(editor, big, 'big.pdf');
      expect(res.status).toBe(413);
      expect((res.body as ErrorBody).errorCode).toBe('MEDIA_FILE_TOO_LARGE');
    });

    it('is 400 without a file and 415 for a non-multipart body', async () => {
      const noFile = multipart([{ field: 'alt', value: 'x' }]);
      const missing = await http()
        .post(MEDIA)
        .set(bearer(editor))
        .set('Content-Type', noFile.contentType)
        .send(noFile.body);
      expect(missing.status).toBe(400);
      expect((missing.body as ErrorBody).errorCode).toBe(
        'MEDIA_INVALID_UPLOAD',
      );
      const json = await http().post(MEDIA).set(bearer(editor)).send({});
      expect(json.status).toBe(415);
    });

    it('is 401 without a token and 403 without media create', async () => {
      expect((await upload(undefined, fixtures.png)).status).toBe(401);
      expect((await upload(guest, fixtures.png)).status).toBe(403);
      expect((await upload(readOnly, fixtures.png)).status).toBe(403);
    });
  });

  describe('GET /media', () => {
    async function clear(): Promise<void> {
      await db.prisma.fileLibrary.deleteMany();
    }

    it('lists newest first with page meta and hides soft-deleted rows', async () => {
      await clear();
      for (const name of ['a.png', 'b.png', 'c.png']) {
        expect((await upload(editor, fixtures.png, name)).status).toBe(201);
      }
      const rows = await db.prisma.fileLibrary.findMany({
        orderBy: { id: 'asc' },
      });
      await db.prisma.fileLibrary.update({
        where: { id: rows[0]?.id as number },
        data: { deletedAt: new Date() },
      });

      const res = await http().get(MEDIA).set(bearer(editor));
      expect(res.status).toBe(200);
      const page = res.body as Page;
      expect(page.data.map((file) => file.fileName)).toEqual([
        'c.png',
        'b.png',
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(JSON.stringify(page)).not.toMatch(/storageKey|sha256|deletedAt/);
      expect(res.headers['cache-control']).toMatch(/no-store/);

      const second = await http()
        .get(`${MEDIA}?page=2&pageSize=1`)
        .set(bearer(owner));
      const secondPage = second.body as Page;
      expect(secondPage.data.map((file) => file.fileName)).toEqual(['b.png']);
      expect(secondPage.meta).toEqual({ page: 2, pageSize: 1, total: 2 });
    });

    it('is 400 for a bad page query', async () => {
      for (const query of [
        'pageSize=101',
        'page=0',
        'sort=name',
        'pageSize=x',
      ]) {
        const res = await http().get(`${MEDIA}?${query}`).set(bearer(editor));
        expect(res.status).toBe(400);
      }
    });

    it('is 401 without a token and 403 without media read; a read-only role lists', async () => {
      expect((await http().get(MEDIA)).status).toBe(401);
      expect((await http().get(MEDIA).set(bearer(guest))).status).toBe(403);
      expect((await http().get(MEDIA).set(bearer(readOnly))).status).toBe(200);
    });

    it('gives a reviewer only preset rows through the policy row filter', async () => {
      await clear();
      const plain = await upload(editor, fixtures.png, 'plain.png');
      const preset = await upload(editor, fixtures.png, 'preset.png');
      await db.prisma.fileLibrary.update({
        where: { documentId: (preset.body as MediaBody).id },
        data: { isReviewerPreset: true },
      });
      expect(plain.status).toBe(201);

      const media = app.get(MediaLibraryService);
      const role = systemRole('reviewer', [
        grant('media', PermissionAction.read),
      ]);
      const asReviewer = await media.list(reviewerActor(99, 1, role), {
        page: 1,
        pageSize: 20,
      });
      expect(asReviewer.data.map((file) => file.fileName)).toEqual([
        'preset.png',
      ]);
      expect(asReviewer.meta.total).toBe(1);

      const asEditor = await http().get(MEDIA).set(bearer(editor));
      expect((asEditor.body as Page).meta.total).toBe(2);
    });
  });
});

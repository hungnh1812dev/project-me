import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
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
import { startPostgres } from '../fixtures/postgres.fixture';
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

describe('document media references (T29; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let databaseUrl: string;
  let jpeg: Buffer;
  let accountCount = 0;
  let editor: string;
  let admin: string;

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
    editor = await signedIn('editor');
    admin = await signedIn('admin');
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

  const DOCS = '/api/v1/documents/gallery';
  const FILE_KEYS = [
    'id',
    'fileName',
    'url',
    'thumbnailUrl',
    'provider',
    'alt',
    'size',
    'createdAt',
  ];

  interface Doc {
    documentId: string;
    version: number;
    values: { cover: Record<string, unknown> | null };
    components: {
      block: { values: { image: Record<string, unknown> | null } }[];
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
    expect(Object.keys(doc.values.cover ?? {}).sort()).toEqual(
      [...FILE_KEYS].sort(),
    );
    expect(doc.values.cover).toMatchObject({ id, provider: 'cloudinary' });
    expect(doc.components.block[0]?.values.image).toMatchObject({ id });
    const stored = await db.prisma.$queryRawUnsafe<{ cover: number }[]>(
      'select cover from content.gallery where document_id = $1::uuid',
      doc.documentId,
    );
    expect(stored[0]?.cover).toBe(internalId);
    const detail = await http()
      .get(`${DOCS}/${doc.documentId}?status=draft`)
      .set(bearer(editor));
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
      const res = await http()
        .post(DOCS)
        .set(bearer(editor))
        .send({ values: { cover } });
      expect(res.status).toBe(400);
      expect((res.body as { errorCode: string }).errorCode).toBe(
        'DOCUMENT_INVALID',
      );
    }
    expect(id).toBeDefined();
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

  it('rejects filtering and sorting on a media field (internal id stays private)', async () => {
    const { id } = await uploaded();
    for (const query of [
      '?filter[cover][eq]=1',
      `?filter[cover][eq]=${id}`,
      '?filter[cover][in]=1,2',
      '?sort=cover',
      '?sort=-cover',
    ]) {
      const res = await http()
        .get(`${DOCS}${query}&status=draft`)
        .set(bearer(editor));
      expect(res.status).toBe(400);
    }
  });
});

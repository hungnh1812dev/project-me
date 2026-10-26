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

describe('media alt update (T29; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let databaseUrl: string;
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

  const auditCount = () => db.prisma.auditLog.count();

  it('sets, trims and clears the alt text without an audit row', async () => {
    const { id } = await uploaded();
    const before = await auditCount();
    const set = await http()
      .patch(`${MEDIA}/${id}`)
      .set(bearer(editor))
      .send({ alt: '  A red door  ' });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ id, alt: 'A red door' });
    expect(set.body).not.toHaveProperty('storageKey');
    const list = await http().get(MEDIA).set(bearer(admin));
    const listed = (list.body as { data: { id: string; alt: string }[] }).data;
    expect(listed.find((m) => m.id === id)?.alt).toBe('A red door');
    const blank = await http()
      .patch(`${MEDIA}/${id}`)
      .set(bearer(admin))
      .send({ alt: '   ' });
    expect((blank.body as { alt: null }).alt).toBeNull();
    const nulled = await http()
      .patch(`${MEDIA}/${id}`)
      .set(bearer(admin))
      .send({ alt: null });
    expect(nulled.status).toBe(200);
    expect(await auditCount()).toBe(before);
  });

  it('400 for a strict-body violation or an alt over 500 characters', async () => {
    const { id } = await uploaded();
    const patch = (body: unknown) =>
      http()
        .patch(`${MEDIA}/${id}`)
        .set(bearer(admin))
        .send(body as object);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ alt: 'x', fileName: 'y' })).status).toBe(400);
    expect((await patch({ alt: 5 })).status).toBe(400);
    expect((await patch({ alt: 'x'.repeat(501) })).status).toBe(400);
    expect((await patch({ alt: 'x'.repeat(500) })).status).toBe(200);
    await http()
      .patch(`${MEDIA}/not-a-uuid`)
      .set(bearer(admin))
      .send({ alt: 'a' })
      .expect(400);
  });

  it('404 for an unknown or soft-deleted file', async () => {
    const { id } = await uploaded();
    await http().delete(`${MEDIA}/${id}`).set(bearer(admin)).expect(204);
    for (const target of [id, MISSING_ID]) {
      const res = await http()
        .patch(`${MEDIA}/${target}`)
        .set(bearer(admin))
        .send({ alt: 'a' });
      expect(res.status).toBe(404);
      expect((res.body as { errorCode: string }).errorCode).toBe(
        'MEDIA_NOT_FOUND',
      );
    }
  });

  it('401 without a session, 403 without media:update', async () => {
    const { id } = await uploaded();
    await http().patch(`${MEDIA}/${id}`).send({ alt: 'a' }).expect(401);
    await http()
      .patch(`${MEDIA}/${id}`)
      .set(bearer(guest))
      .send({ alt: 'a' })
      .expect(403);
    const row = await db.prisma.fileLibrary.findUniqueOrThrow({
      where: { documentId: id },
    });
    expect(row.alt).toBeNull();
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { API_CONTENT_SECURITY_POLICY } from '../../src/common/constants/Http.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { PUBLIC_MEDIA_CACHE_CONTROL } from '../../src/modules/media/domain/Media.constants';
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
import { buildMediaFixtures } from '../fixtures/Media.fixture';
import { multipart } from '../fixtures/Multipart.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const PASSWORD = 'correct horse battery staple';
const PUBLIC_ORIGIN = 'http://localhost:8080';
const FILES_PATH = '/api/v1/media-files';
const UNKNOWN_FILE = '01900000-0000-7000-8000-000000000001.png';

describe('public media files (UIL-10; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let db: PrismaHandle;
  let localApp: NestExpressApplication;
  let fakeApp: NestExpressApplication;
  let directory: string;
  let png: Buffer;
  let token: string;

  const baseEnv = (databaseUrl: string) => ({
    ...dbEnvOf(databaseUrl),
    JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
    JWT_ACCESS_KID: TEST_JWT_KID,
    OTP_PEPPER: TEST_SECRET_32_BYTES,
    ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    TRUST_PROXY_HOPS: '1',
  });

  beforeAll(async () => {
    png = (await buildMediaFixtures()).png;
    directory = await mkdtemp(join(tmpdir(), 'abyss-media-files-'));
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);
    localApp = await createTestApp(
      devEnv({
        ...baseEnv(databaseUrl),
        MEDIA_PROVIDER: 'local',
        MEDIA_LOCAL_DIR: directory,
        MEDIA_LOCAL_PUBLIC_URL: `${PUBLIC_ORIGIN}${FILES_PATH}`,
      }),
    );
    fakeApp = await createTestApp(devEnv(baseEnv(databaseUrl)));
    await db.prisma.account.create({
      data: {
        email: 'uil10-admin@example.test',
        displayName: 'Admin',
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'admin' } },
      },
    });
    const login = await request(localApp.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.10.0.1')
      .send({ email: 'uil10-admin@example.test', password: PASSWORD });
    if (login.status !== 200) throw new Error(`Test login failed: ${login.status}`);
    token = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await localApp?.close();
    await fakeApp?.close();
    await db?.close();
    await postgres?.stop();
    await rm(directory, { recursive: true, force: true });
  });

  async function upload(): Promise<{ url: string; thumbnailUrl: string }> {
    const { body, contentType } = multipart([
      { field: 'file', fileName: 'a.png', data: png, contentType: 'image/png' },
    ]);
    const res = await request(localApp.getHttpServer())
      .post('/api/v1/media')
      .set({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': '10.10.0.2' })
      .set('Content-Type', contentType)
      .send(body);
    expect(res.status).toBe(201);
    return res.body as { url: string; thumbnailUrl: string };
  }

  it('serves an uploaded file at the returned url with no session', async () => {
    const { url, thumbnailUrl } = await upload();
    expect(url.startsWith(`${PUBLIC_ORIGIN}${FILES_PATH}/`)).toBe(true);
    expect(thumbnailUrl).toBe(url);
    const res = await request(localApp.getHttpServer())
      .get(url.slice(PUBLIC_ORIGIN.length))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['content-length']).toBe(String((res.body as Buffer).length));
    expect(res.headers['cache-control']).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe(API_CONTENT_SECURITY_POLICY);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((res.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });

  it.each([
    ['an unknown uuid', UNKNOWN_FILE],
    ['a name with no extension', '01900000-0000-7000-8000-000000000001'],
    ['a name that is not a uuid', 'x.png'],
    ['a disallowed extension', '01900000-0000-7000-8000-000000000001.svg'],
    ['a dot-dot name', '..'],
    ['an encoded separator', '..%2F..%2Fetc%2Fpasswd'],
    ['an encoded dot-dot', '%2e%2e'],
  ])('404 with the standard error body for %s', async (_label, name) => {
    const res = await request(localApp.getHttpServer()).get(`${FILES_PATH}/${name}`);
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).not.toBe(PUBLIC_MEDIA_CACHE_CONTROL);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });

  it('404 for every name when the provider is not local', async () => {
    const res = await request(fakeApp.getHttpServer()).get(`${FILES_PATH}/${UNKNOWN_FILE}`);
    expect(res.status).toBe(404);
  });
});

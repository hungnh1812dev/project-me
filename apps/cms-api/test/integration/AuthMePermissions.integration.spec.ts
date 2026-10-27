import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { Clock } from '../../src/common/time/Clock.service';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { ARTICLE_DEFINITION } from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/Env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/Access.fixture';

const PASSWORD = 'correct horse battery staple';
const ME = '/api/v1/auth/me';
const LOGIN = '/api/v1/auth/login';

describe('GET /auth/me permissions (T33a; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let count = 0;

  beforeAll(async () => {
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
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
      }),
      [
        {
          token: ContentRegistry,
          value: { registry: () => Promise.resolve(registry) },
        },
      ],
    );
    // Not testing throttling: every rate-limit lookup lands in a new window.
    let fakeNow = Date.now();
    jest
      .spyOn(app.get(Clock), 'now')
      .mockImplementation(() => (fakeNow += 3_600_000));
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  async function permissionsOf(role: string): Promise<string[]> {
    count += 1;
    const email = `${role}${count}@example.test`;
    await db.prisma.account.create({
      data: {
        email,
        displayName: role,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: role } },
      },
    });
    const server = app.getHttpServer();
    const login = await request(server)
      .post(LOGIN)
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    const res = await request(server)
      .get(ME)
      .set(
        'Authorization',
        `Bearer ${(login.body as { accessToken: string }).accessToken}`,
      );
    expect(res.status).toBe(200);
    const body = res.body as { role: string; permissions: string[] };
    expect(body.role).toBe(role);
    return body.permissions;
  }

  it('owner gets every action on every known subject', async () => {
    const list = await permissionsOf('owner');
    expect(list).toEqual(
      expect.arrayContaining([
        'article:read',
        'article:delete',
        'article:publish',
        'accounts:create',
        'roles:update',
        'api_tokens:delete',
      ]),
    );
    expect(list.some((entry) => entry.startsWith('*'))).toBe(false);
  });

  it('editor gets the seeded content and media permissions only', async () => {
    const list = await permissionsOf('editor');
    expect(list).toEqual(
      expect.arrayContaining([
        'article:read',
        'article:update',
        'article:publish',
        'media:create',
      ]),
    );
    expect(list).not.toContain('article:delete');
    expect(
      list.some((entry) => /^(accounts|roles|api_tokens):/.test(entry)),
    ).toBe(false);
  });

  it('keeps the other /auth/me fields unchanged', async () => {
    count += 1;
    const email = `fields${count}@example.test`;
    await db.prisma.account.create({
      data: {
        email,
        displayName: 'Fields',
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
    });
    const server = app.getHttpServer();
    const login = await request(server)
      .post(LOGIN)
      .send({ email, password: PASSWORD });
    const res = await request(server)
      .get(ME)
      .set(
        'Authorization',
        `Bearer ${(login.body as { accessToken: string }).accessToken}`,
      );
    expect(Object.keys(res.body as object).sort()).toEqual([
      'displayName',
      'email',
      'id',
      'permissions',
      'role',
      'twoFactorEnabled',
      'twoFactorMethod',
    ]);
  });
});

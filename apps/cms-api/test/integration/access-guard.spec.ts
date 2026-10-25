import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { Clock } from '../../src/common/time/clock';
import { ERROR_CODES } from '../../src/common/constants/error.constants';
import { PermissionAction } from '../../src/generated/prisma/client';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { AccessModule } from '../../src/modules/access/access.module';
import type { PermissionGrant } from '../../src/modules/access/domain/ActorContext.entity';
import { RequirePermission } from '../../src/modules/access/permission.decorator';
import { PermissionGuard } from '../../src/modules/access/permission.guard';
import { RolePermissionsService } from '../../src/modules/access/application/RolePermissions.service';
import { seedRolePermissions } from '../../src/modules/access/roles/role-permissions.seed';
import {
  VERSION_CACHE_TTL_MS,
  VersionCache,
} from '../../src/modules/access/application/VersionCache.service';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { JwtAuthGuard } from '../../src/modules/identity/jwt.strategy';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
import { ARTICLE_DEFINITION, grant } from '../fixtures/access.fixture';
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

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a different horse battery staple';
const ME = '/api/v1/auth/me';
const PROBE = '/api/v1/test-probe';
const { read, update } = PermissionAction;

/**
 * Test-only routes guarded like real ones will be (T20/T21 add the real
 * document routes). Registered only in this spec's app, never in AppModule.
 */
@Controller('test-probe')
@UseGuards(JwtAuthGuard, PermissionGuard)
class ProbeController {
  @Put('documents/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: update, subjectParam: 'slug' })
  updateDocument(): void {}

  @Get('audit-logs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: read, subject: 'audit_logs' })
  auditLogs(): void {}

  @Get('signed-in')
  @HttpCode(HttpStatus.NO_CONTENT)
  signedIn(): void {}
}

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [ProbeController],
})
class ProbeModule {}

describe('revocation versions + permission guard (T15, §12-11; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let editorRoleId: number;
  let editorDefaults: PermissionGrant[];
  let accountCount = 0;
  let now = Date.now();

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
      [ProbeModule],
    );
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => now);
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { slug: 'editor' },
      include: { permissions: true },
    });
    editorRoleId = role.id;
    editorDefaults = role.permissions.map((row) =>
      grant(row.subject, row.action),
    );
  });

  afterEach(async () => {
    // Every test starts from the seeded editor rows.
    await app
      .get(RolePermissionsService)
      .replacePermissions(editorRoleId, editorDefaults);
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());

  async function editorToken(): Promise<{ id: number; token: string }> {
    accountCount += 1;
    const email = `editor${accountCount}@example.test`;
    const account = await db.prisma.account.create({
      data: {
        email,
        displayName: `Editor ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true },
    });
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return {
      id: account.id,
      token: (res.body as { accessToken: string }).accessToken,
    };
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  function errorCodeOf(res: request.Response): unknown {
    return (res.body as { errorCode?: unknown }).errorCode;
  }

  it('an editor losing update gets 403 on the next request with the same token', async () => {
    const { token } = await editorToken();
    const put = () =>
      http().put(`${PROBE}/documents/article`).set(bearer(token));
    expect((await put()).status).toBe(204);

    const before = await db.prisma.role.findUniqueOrThrow({
      where: { id: editorRoleId },
    });
    const version = await app.get(RolePermissionsService).replacePermissions(
      editorRoleId,
      editorDefaults.filter((row) => row.action !== update),
    );
    expect(version).toBe(before.policyVersion + 1);

    const res = await put();
    expect(res.status).toBe(403);
    expect(errorCodeOf(res)).toBe(ERROR_CODES.FORBIDDEN);
    // Still signed in: only the permission changed.
    expect((await http().get(ME).set(bearer(token))).status).toBe(200);
  });

  it('a policy_version bump applies new grants on the next request', async () => {
    const { token } = await editorToken();
    const audit = () => http().get(`${PROBE}/audit-logs`).set(bearer(token));
    expect((await audit()).status).toBe(403);
    await app
      .get(RolePermissionsService)
      .replacePermissions(editorRoleId, [
        ...editorDefaults,
        grant('audit_logs', read),
      ]);
    expect((await audit()).status).toBe(204);
  });

  it('a slug that is not a registered content type is 404', async () => {
    const { token } = await editorToken();
    const res = await http()
      .put(`${PROBE}/documents/missing`)
      .set(bearer(token));
    expect(res.status).toBe(404);
  });

  it('routes without @RequirePermission only need a valid token', async () => {
    const { token } = await editorToken();
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(204);
    expect((await http().get(`${PROBE}/signed-in`)).status).toBe(401);
  });

  it('a token_version bump (password change) is 401 on the next request', async () => {
    const { token } = await editorToken();
    expect((await http().get(ME).set(bearer(token))).status).toBe(200);
    const change = await http()
      .post('/api/v1/auth/password/change')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(204);
    expect((await http().get(ME).set(bearer(token))).status).toBe(401);
  });

  it('a disabled account is 401 on the next request once its write invalidates', async () => {
    const { id, token } = await editorToken();
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(204);
    await db.prisma.account.update({
      where: { id },
      data: { status: 'disabled' },
    });
    // The T17 write path will do this after its commit.
    app.get(VersionCache).invalidateAccount(id);
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(401);
  });

  it('a write the process cannot see (CLI, other replica) applies within the TTL', async () => {
    const { id, token } = await editorToken();
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(204);
    await db.prisma.account.update({
      where: { id },
      data: { status: 'disabled' },
    });
    // Served from the cache until the entry expires (/auth/me would
    // re-read the account itself, so probe a route that only has the guard).
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(204);
    now += VERSION_CACHE_TTL_MS;
    expect(
      (await http().get(`${PROBE}/signed-in`).set(bearer(token))).status,
    ).toBe(401);
  });

  it('the same for a role write made outside RolePermissionsService', async () => {
    const { token } = await editorToken();
    const put = () =>
      http().put(`${PROBE}/documents/article`).set(bearer(token));
    expect((await put()).status).toBe(204);
    await db.prisma.permission.deleteMany({
      where: { roleId: editorRoleId, action: update },
    });
    now += VERSION_CACHE_TTL_MS;
    expect((await put()).status).toBe(403);
  });
});

import { createHash } from 'node:crypto';

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PermissionAction } from '../../src/generated/prisma/client';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { ACCESS_ERROR_CODES } from '../../src/modules/access/domain/Access.constants';
import { AccessModule } from '../../src/modules/access/Access.module';
import { MANAGEMENT_ERROR_CODES } from '../../src/modules/access/management/domain/AccessManagement.constants';
import { ApiTokenGuard } from '../../src/modules/access/http/ApiToken.guard';
import { API_TOKEN } from '../../src/modules/access/domain/ApiToken.rules';
import {
  PermissionGuard,
  RequirePermission,
} from '../../src/modules/access/http/Permission.guard';
import {
  AUDIT_ACTIONS,
  type AuditAction,
} from '../../src/modules/security-audit';
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
const TOKENS = '/api/v1/api-tokens';
const ACCOUNTS = '/api/v1/accounts';
const ROLES = '/api/v1/roles';
const LOGIN = '/api/v1/auth/login';
const PROBE = '/api/v1/test-probe/documents/article';
const OCTET_RANGE = 250;
const HOUR_MS = 3_600_000;
const { read, delete: remove } = PermissionAction;

/**
 * Test-only content routes guarded the way T20/T21 will guard the real ones:
 * token authentication, then the permission guard (never in AppModule).
 */
@Controller('test-probe')
@UseGuards(ApiTokenGuard, PermissionGuard)
class TokenProbeController {
  @Get('documents/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: read, subjectParam: 'slug' })
  readDocument(): void {}

  @Delete('documents/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ action: remove, subjectParam: 'slug' })
  deleteDocument(): void {}
}

@Module({ imports: [AccessModule], controllers: [TokenProbeController] })
class TokenProbeModule {}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.3.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

function errorCodeOf(res: request.Response): unknown {
  return (res.body as { errorCode?: unknown }).errorCode;
}

interface Signed {
  readonly id: number;
  readonly documentId: string;
  readonly token: string;
}

interface TokenBody {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  token?: string;
  scope: { permissions: unknown[] };
  createdBy: { id: string };
}

const READ_ARTICLE = {
  permissions: [{ subject: 'article', action: 'read' }],
};

describe('API tokens (T19, D5, §12-6; Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let roleIds: Record<string, string>;
  let accountCount = 0;
  let owner: Signed;

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
      [TokenProbeModule],
    );
    const roles = await db.prisma.role.findMany({
      select: { slug: true, documentId: true },
    });
    roleIds = Object.fromEntries(roles.map((r) => [r.slug, r.documentId]));
    owner = await signedIn('owner');
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

  async function signedIn(roleSlug: string): Promise<Signed> {
    accountCount += 1;
    const account = await db.prisma.account.create({
      data: {
        email: `t19-user${accountCount}@example.test`,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: roleSlug } },
      },
      select: { id: true, documentId: true, email: true },
    });
    const res = await http()
      .post(LOGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ email: account.email, password: PASSWORD });
    expect(res.status).toBe(200);
    return {
      id: account.id,
      documentId: account.documentId,
      token: (res.body as { accessToken: string }).accessToken,
    };
  }

  async function createToken(
    who: Signed,
    scope: unknown = READ_ARTICLE,
    extra: Record<string, unknown> = {},
  ) {
    return http()
      .post(TOKENS)
      .set(bearer(who.token))
      .send({ name: 'CI', scope, ...extra });
  }

  async function createdToken(
    who: Signed,
    scope: unknown = READ_ARTICLE,
  ): Promise<TokenBody & { token: string }> {
    const res = await createToken(who, scope);
    expect(res.status).toBe(201);
    return res.body as TokenBody & { token: string };
  }

  async function auditRows(action: AuditAction, targetId?: string) {
    return db.prisma.auditLog.findMany({
      where: { action, ...(targetId === undefined ? {} : { targetId }) },
      orderBy: { id: 'asc' },
    });
  }

  /** A custom role (rank 20) with api_tokens CRUD plus the given content rows. */
  async function signedInWithRole(
    slug: string,
    contentRows: { action: string; readableFields?: string[] }[],
  ): Promise<Signed> {
    const created = await http()
      .post(ROLES)
      .set(bearer(owner.token))
      .send({ slug, name: slug, rank: 20 });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    await http()
      .put(`${ROLES}/${id}/permissions`)
      .set(bearer(owner.token))
      .send({
        permissions: [
          ...['read', 'create', 'update'].map((action) => ({
            subject: 'api_tokens',
            action,
          })),
          ...contentRows.map((row) => ({ subject: 'article', ...row })),
        ],
      })
      .expect(200);
    return signedIn(slug);
  }

  describe('create', () => {
    it('returns the raw token once, stores only its hash, audits in the same transaction', async () => {
      const admin = await signedIn('admin');
      const res = await createToken(admin, READ_ARTICLE);
      expect(res.status).toBe(201);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.body as TokenBody & { token: string };
      expect(body.token).toMatch(/^ak_live_[A-Za-z0-9_-]{43}$/);
      expect(body.tokenPrefix).toBe(
        body.token.slice(0, API_TOKEN.DISPLAY_PREFIX_LENGTH),
      );

      const row = await db.prisma.apiToken.findUniqueOrThrow({
        where: { documentId: body.id },
      });
      expect(row.tokenHash).toBe(
        createHash('sha256').update(body.token).digest('hex'),
      );
      expect(JSON.stringify(row)).not.toContain(body.token);
      expect(row.createdById).toBe(admin.id);

      const audit = await auditRows(AUDIT_ACTIONS.API_TOKEN_CREATED, body.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorId).toBe(admin.id);
      expect(audit[0]?.subject).toBe('api_tokens');
      expect(JSON.stringify(audit[0]?.metadata)).not.toContain(body.token);

      const list = await http().get(TOKENS).set(bearer(admin.token));
      const listed = (list.body as { data: TokenBody[] }).data;
      expect(listed.map((t) => t.id)).toContain(body.id);
      expect(JSON.stringify(list.body)).not.toContain(body.token);
      expect(JSON.stringify(list.body)).not.toContain(row.tokenHash);
    });

    it('rejects an invalid scope (system subject, unknown field, bad shape) with 400', async () => {
      const admin = await signedIn('admin');
      const attempts = await Promise.all([
        createToken(admin, {
          permissions: [{ subject: 'accounts', action: 'read' }],
        }),
        createToken(admin, {
          permissions: [
            {
              subject: 'article',
              action: 'read',
              readableFields: ['nope'],
            },
          ],
        }),
        createToken(admin, { permissions: 'all' }),
        createToken(admin, null),
      ]);
      expect(attempts.map((res) => res.status)).toEqual([400, 400, 400, 400]);
      expect(attempts.map(errorCodeOf)).toEqual([
        ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
        ACCESS_ERROR_CODES.PERMISSION_INVALID_FIELDS,
        ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
        ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID,
      ]);
    });

    it('rejects a scope over the entry cap on create and update (400)', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      const big = {
        permissions: Array.from(
          { length: API_TOKEN.MAX_SCOPE_ENTRIES + 1 },
          () => ({ subject: 'article', action: 'read' }),
        ),
      };
      const created = await createToken(admin, big);
      const updated = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(admin.token))
        .send({ scope: big });
      for (const res of [created, updated]) {
        expect(res.status).toBe(400);
        expect(errorCodeOf(res)).toBe(ACCESS_ERROR_CODES.TOKEN_SCOPE_INVALID);
      }
    });

    it('rejects a past expiry and an unknown body key', async () => {
      const admin = await signedIn('admin');
      const past = await createToken(admin, READ_ARTICLE, {
        expiresAt: new Date(Date.now() - HOUR_MS).toISOString(),
      });
      const extra = await createToken(admin, READ_ARTICLE, { role: 'owner' });
      expect(past.status).toBe(400);
      expect(extra.status).toBe(400);
    });

    it('refuses a scope beyond the creator (D5) with 403, creating and auditing nothing', async () => {
      const limited = await signedInWithRole('t19-limited', [
        { action: 'read', readableFields: ['title'] },
      ]);
      const before = await db.prisma.apiToken.count();
      const auditBefore = (await auditRows(AUDIT_ACTIONS.API_TOKEN_CREATED))
        .length;
      const attempts = await Promise.all([
        createToken(limited, {
          permissions: [{ subject: 'article', action: 'update' }],
        }),
        createToken(limited, {
          permissions: [{ subject: 'article', action: 'read' }],
        }),
        createToken(limited, {
          permissions: [
            {
              subject: 'article',
              action: 'read',
              readableFields: ['title', 'priority'],
            },
          ],
        }),
        createToken(limited, {
          permissions: [{ subject: '*', action: 'read' }],
        }),
      ]);
      for (const res of attempts) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(
          MANAGEMENT_ERROR_CODES.TOKEN_SCOPE_NOT_HELD,
        );
      }
      expect(await db.prisma.apiToken.count()).toBe(before);
      expect((await auditRows(AUDIT_ACTIONS.API_TOKEN_CREATED)).length).toBe(
        auditBefore,
      );

      const ok = await createToken(limited, {
        permissions: [
          { subject: 'article', action: 'read', readableFields: ['title'] },
        ],
      });
      expect(ok.status).toBe(201);
    });

    it('needs the api_tokens permission: an editor gets 403', async () => {
      const editor = await signedIn('editor');
      expect((await createToken(editor)).status).toBe(403);
      expect((await http().get(TOKENS).set(bearer(editor.token))).status).toBe(
        403,
      );
    });
  });

  describe('JWT sessions only', () => {
    it('a token cannot create, update, revoke or list tokens (401)', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin, {
        permissions: [{ subject: '*', action: 'read' }],
      });
      const attempts = await Promise.all([
        http().get(TOKENS).set(bearer(token.token)),
        http()
          .post(TOKENS)
          .set(bearer(token.token))
          .send({ name: 'x', scope: READ_ARTICLE }),
        http()
          .patch(`${TOKENS}/${token.id}`)
          .set(bearer(token.token))
          .send({ name: 'y' }),
        http().post(`${TOKENS}/${token.id}/revoke`).set(bearer(token.token)),
      ]);
      for (const res of attempts) expect(res.status).toBe(401);
    });
  });

  describe('visibility and ownership', () => {
    it('an admin sees and manages only their own tokens; the Owner sees all', async () => {
      const first = await signedIn('admin');
      const second = await signedIn('admin');
      const mine = await createdToken(first);
      const theirs = await createdToken(second);

      const list = await http().get(TOKENS).set(bearer(first.token));
      const ids = (list.body as { data: TokenBody[] }).data.map((t) => t.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);

      const patch = await http()
        .patch(`${TOKENS}/${theirs.id}`)
        .set(bearer(first.token))
        .send({ name: 'taken over' });
      const revoke = await http()
        .post(`${TOKENS}/${theirs.id}/revoke`)
        .set(bearer(first.token));
      for (const res of [patch, revoke]) {
        expect(res.status).toBe(404);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.TOKEN_NOT_FOUND);
      }
      expect((await http().get(PROBE).set(bearer(theirs.token))).status).toBe(
        204,
      );

      const ownerList = await http()
        .get(`${TOKENS}?pageSize=100`)
        .set(bearer(owner.token));
      const ownerIds = (ownerList.body as { data: TokenBody[] }).data.map(
        (t) => t.id,
      );
      expect(ownerIds).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      const ownerRevoke = await http()
        .post(`${TOKENS}/${theirs.id}/revoke`)
        .set(bearer(owner.token));
      expect(ownerRevoke.status).toBe(204);
    });

    it('paginates the list', async () => {
      const admin = await signedIn('admin');
      await createdToken(admin);
      await createdToken(admin);
      await createdToken(admin);
      const res = await http()
        .get(`${TOKENS}?page=2&pageSize=2`)
        .set(bearer(admin.token));
      const body = res.body as { data: TokenBody[]; meta: { total: number } };
      expect(body.meta.total).toBe(3);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('renames, narrows, sets and clears the expiry; audits the changed field names', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin, {
        permissions: [
          { subject: 'article', action: 'read' },
          { subject: 'article', action: 'create' },
        ],
      });
      const expiresAt = new Date(Date.now() + HOUR_MS).toISOString();
      const res = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(admin.token))
        .send({ name: 'Renamed', scope: READ_ARTICLE, expiresAt });
      expect(res.status).toBe(200);
      const body = res.body as TokenBody & { expiresAt: string };
      expect(body.name).toBe('Renamed');
      expect(body.scope.permissions).toHaveLength(1);
      expect(body.expiresAt).toBe(expiresAt);
      expect(body).not.toHaveProperty('token');

      const cleared = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(admin.token))
        .send({ expiresAt: null });
      expect((cleared.body as { expiresAt: unknown }).expiresAt).toBeNull();

      const audit = await auditRows(AUDIT_ACTIONS.API_TOKEN_UPDATED, token.id);
      expect(audit).toHaveLength(2);
      expect(audit[0]?.metadata).toMatchObject({
        fields: ['name', 'scope', 'expiresAt'],
      });
    });

    it('re-runs the subset check on update (D5): widening past the creator is 403 and changes nothing', async () => {
      const limited = await signedInWithRole('t19-limited-update', [
        { action: 'read' },
      ]);
      const token = await createdToken(limited, READ_ARTICLE);
      const res = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(limited.token))
        .send({
          scope: { permissions: [{ subject: 'article', action: 'delete' }] },
        });
      expect(res.status).toBe(403);
      expect(errorCodeOf(res)).toBe(
        MANAGEMENT_ERROR_CODES.TOKEN_SCOPE_NOT_HELD,
      );
      const row = await db.prisma.apiToken.findUniqueOrThrow({
        where: { documentId: token.id },
      });
      expect(row.scope).toEqual(READ_ARTICLE);
      expect(
        await auditRows(AUDIT_ACTIONS.API_TOKEN_UPDATED, token.id),
      ).toEqual([]);
    });

    it('checks the Owner’s edit of someone else’s token against the token’s creator', async () => {
      const limited = await signedInWithRole('t19-limited-owner-edit', [
        { action: 'read' },
      ]);
      const token = await createdToken(limited, READ_ARTICLE);
      const res = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(owner.token))
        .send({
          scope: { permissions: [{ subject: 'article', action: 'delete' }] },
        });
      expect(res.status).toBe(403);
      expect(errorCodeOf(res)).toBe(
        MANAGEMENT_ERROR_CODES.TOKEN_SCOPE_NOT_HELD,
      );
    });

    it('does not update a revoked token (409)', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await http()
        .post(`${TOKENS}/${token.id}/revoke`)
        .set(bearer(admin.token))
        .expect(204);
      const res = await http()
        .patch(`${TOKENS}/${token.id}`)
        .set(bearer(admin.token))
        .send({ name: 'again' });
      expect(res.status).toBe(409);
      expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.TOKEN_REVOKED);
    });

    it('does not update an expired token (409 API_TOKEN_EXPIRED) whatever the body, and changes nothing', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await db.prisma.apiToken.update({
        where: { documentId: token.id },
        data: { expiresAt: new Date(Date.now() - HOUR_MS) },
      });
      const before = await db.prisma.apiToken.findUniqueOrThrow({
        where: { documentId: token.id },
      });
      const bodies = [
        { name: 'Renamed' },
        { scope: { permissions: [{ subject: 'article', action: 'create' }] } },
        { expiresAt: new Date(Date.now() + HOUR_MS).toISOString() },
        { expiresAt: null },
      ];
      for (const body of bodies) {
        const res = await http()
          .patch(`${TOKENS}/${token.id}`)
          .set(bearer(admin.token))
          .send(body);
        expect(res.status).toBe(409);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.TOKEN_EXPIRED);
        const row = await db.prisma.apiToken.findUniqueOrThrow({
          where: { documentId: token.id },
        });
        expect(row.name).toBe(before.name);
        expect(row.scope).toEqual(before.scope);
        expect(row.expiresAt).toEqual(before.expiresAt);
      }
      expect(
        await auditRows(AUDIT_ACTIONS.API_TOKEN_UPDATED, token.id),
      ).toEqual([]);
      const listed = await http().get(TOKENS).set(bearer(admin.token));
      expect(
        (listed.body as { data: TokenBody[] }).data.find(
          (t) => t.id === token.id,
        )?.status,
      ).toBe('expired');
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        401,
      );
    });

    it('answers an unknown id with 404 and a malformed id with 400', async () => {
      const admin = await signedIn('admin');
      const unknown = await http()
        .patch(`${TOKENS}/0195f3a0-0000-7000-8000-000000000000`)
        .set(bearer(admin.token))
        .send({ name: 'x' });
      const malformed = await http()
        .patch(`${TOKENS}/not-a-uuid`)
        .set(bearer(admin.token))
        .send({ name: 'x' });
      expect(unknown.status).toBe(404);
      expect(malformed.status).toBe(400);
    });
  });

  describe('revoke', () => {
    it('stops the token at once, is audited, and a second revoke is 409', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        204,
      );
      await http()
        .post(`${TOKENS}/${token.id}/revoke`)
        .set(bearer(admin.token))
        .expect(204);
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        401,
      );
      const audit = await auditRows(AUDIT_ACTIONS.API_TOKEN_REVOKED, token.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorId).toBe(admin.id);
      const again = await http()
        .post(`${TOKENS}/${token.id}/revoke`)
        .set(bearer(admin.token));
      expect(again.status).toBe(409);
      expect(
        await auditRows(AUDIT_ACTIONS.API_TOKEN_REVOKED, token.id),
      ).toHaveLength(1);
      const listed = await http().get(TOKENS).set(bearer(admin.token));
      expect(
        (listed.body as { data: TokenBody[] }).data.find(
          (t) => t.id === token.id,
        )?.status,
      ).toBe('revoked');
    });
  });

  describe('revoke of an expired token', () => {
    it('is 204, audited, and the token then lists as revoked', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await db.prisma.apiToken.update({
        where: { documentId: token.id },
        data: { expiresAt: new Date(Date.now() - HOUR_MS) },
      });
      await http()
        .post(`${TOKENS}/${token.id}/revoke`)
        .set(bearer(admin.token))
        .expect(204);
      expect(
        await auditRows(AUDIT_ACTIONS.API_TOKEN_REVOKED, token.id),
      ).toHaveLength(1);
      const listed = await http().get(TOKENS).set(bearer(admin.token));
      expect(
        (listed.body as { data: TokenBody[] }).data.find(
          (t) => t.id === token.id,
        )?.status,
      ).toBe('revoked');
    });
  });

  describe('token authentication (§12-6)', () => {
    it('rejects missing, malformed, unknown and JWT bearers with 401', async () => {
      const admin = await signedIn('admin');
      const attempts = await Promise.all([
        http().get(PROBE),
        http().get(PROBE).set(bearer('ak_live_nope')),
        http()
          .get(PROBE)
          .set(bearer(`${API_TOKEN.PREFIX}${'A'.repeat(43)}`)),
        http().get(PROBE).set(bearer(admin.token)),
        http().get(PROBE).set({ Authorization: 'Basic abc' }),
      ]);
      for (const res of attempts) expect(res.status).toBe(401);
    });

    it('effective permissions follow the creator’s current rows: losing delete gives 403', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin, {
        permissions: [
          { subject: 'article', action: 'read' },
          { subject: 'article', action: 'delete' },
        ],
      });
      expect((await http().delete(PROBE).set(bearer(token.token))).status).toBe(
        204,
      );
      // Admin -> editor: no delete, no api_tokens.
      await http()
        .patch(`${ACCOUNTS}/${admin.documentId}`)
        .set(bearer(owner.token))
        .send({ roleId: roleIds.editor })
        .expect(200);
      expect((await http().delete(PROBE).set(bearer(token.token))).status).toBe(
        403,
      );
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        204,
      );
    });

    it('a scope without the action is 403 even when the creator holds it', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin, READ_ARTICLE);
      expect((await http().delete(PROBE).set(bearer(token.token))).status).toBe(
        403,
      );
    });

    it('a disabled creator gives 401', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await http()
        .post(`${ACCOUNTS}/${admin.documentId}/disable`)
        .set(bearer(owner.token))
        .expect(204);
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        401,
      );
    });

    it('an expired token gives 401', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await db.prisma.apiToken.update({
        where: { documentId: token.id },
        data: { expiresAt: new Date(Date.now() - HOUR_MS) },
      });
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        401,
      );
      const listed = await http().get(TOKENS).set(bearer(admin.token));
      expect(
        (listed.body as { data: TokenBody[] }).data.find(
          (t) => t.id === token.id,
        )?.status,
      ).toBe('expired');
    });

    it('a deleted creator removes the token (cascade)', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      await db.prisma.account.delete({ where: { id: admin.id } });
      expect((await http().get(PROBE).set(bearer(token.token))).status).toBe(
        401,
      );
    });

    it('records last_used_at without moving updated_at', async () => {
      const admin = await signedIn('admin');
      const token = await createdToken(admin);
      const before = await db.prisma.apiToken.findUniqueOrThrow({
        where: { documentId: token.id },
      });
      expect(before.lastUsedAt).toBeNull();
      await http().get(PROBE).set(bearer(token.token)).expect(204);
      const after = await db.prisma.apiToken.findUniqueOrThrow({
        where: { documentId: token.id },
      });
      expect(after.lastUsedAt).not.toBeNull();
      expect(after.updatedAt).toEqual(before.updatedAt);
    });
  });
});

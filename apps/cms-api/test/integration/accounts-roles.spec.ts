import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { REFRESH_COOKIE } from '../../src/common/constants/auth.constants';
import { ERROR_CODES } from '../../src/common/constants/error.constants';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import {
  MAIL_SENDER,
  type MailMessage,
  type MailSender,
} from '../../src/infrastructure/mail/mail.port';
import { ACCESS_ERROR_CODES } from '../../src/modules/access/access.constants';
import { INVALID_REQUEST_ERROR } from '../../src/common/http/request-parsing';
import { MANAGEMENT_ERROR_CODES } from '../../src/modules/access/access-management.constants';
import { seedRolePermissions } from '../../src/modules/access/roles/role-permissions.seed';
import {
  AUDIT_ACTIONS,
  type AuditAction,
  LOGIN_FAILURE_REASONS,
} from '../../src/modules/security-audit/security-audit.constants';
import { ContentRegistryProvider } from '../../src/modules/content-engine/content-engine.module';
import { RegistryService } from '../../src/modules/content-engine/registry.service';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { seedSystemRoles } from '../../src/modules/access/roles/system-roles.seed';
import { ARTICLE_DEFINITION } from '../fixtures/access.fixture';
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
const ACCOUNTS = '/api/v1/accounts';
const ROLES = '/api/v1/roles';
const ME = '/api/v1/auth/me';
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const SET_PASSWORD = '/api/v1/auth/password/set';
const CHANGE_PASSWORD = '/api/v1/auth/password/change';
const UNKNOWN_ID = '0195f3a0-0000-7000-8000-000000000000';
const OCTET_RANGE = 250;
const CODE_PATTERN = /^\d{6}$/m;

class CapturingMailSender implements MailSender {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

let ipCounter = 0;
/** A fresh client IP per request, so the per-IP limits stay out of the way. */
function nextIp(): string {
  ipCounter += 1;
  return `10.2.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

function errorCodeOf(res: request.Response): unknown {
  return (res.body as { errorCode?: unknown }).errorCode;
}

interface Signed {
  readonly id: number;
  readonly documentId: string;
  readonly email: string;
  readonly token: string;
  readonly refreshCookie: string;
}

interface RoleBody {
  id: string;
  slug: string;
  rank: number;
  accountCount: number;
  manageable: boolean;
  permissions: { subject: string; action: string }[];
}

describe('accounts & roles API + security audit (T17, §12-7, §12-18; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let mail: CapturingMailSender;
  let roleIds: Record<string, string>;
  let accountCount = 0;
  let owner: Signed;
  let admin: Signed;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);
    mail = new CapturingMailSender();
    const registry = RegistryService.fromDefinitions([ARTICLE_DEFINITION]);
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
        { token: MAIL_SENDER, value: mail },
        {
          token: ContentRegistryProvider,
          value: { registry: () => Promise.resolve(registry) },
        },
      ],
    );
    const roles = await db.prisma.role.findMany({
      select: { slug: true, documentId: true },
    });
    roleIds = Object.fromEntries(roles.map((r) => [r.slug, r.documentId]));
    owner = await signedIn('owner');
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

  async function createAccount(roleSlug: string) {
    accountCount += 1;
    const email = `t17-user${accountCount}@example.test`;
    return db.prisma.account.create({
      data: {
        email,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: roleSlug } },
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  async function login(email: string, password = PASSWORD) {
    return http()
      .post(LOGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });
  }

  async function signedIn(roleSlug: string): Promise<Signed> {
    const account = await createAccount(roleSlug);
    const res = await login(account.email);
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const refreshCookie = cookies
      .find((c) => c.startsWith(`${REFRESH_COOKIE.NAME}=`))
      ?.split(';')[0];
    if (refreshCookie === undefined) throw new Error('no refresh cookie');
    return {
      ...account,
      token: (res.body as { accessToken: string }).accessToken,
      refreshCookie,
    };
  }

  async function auditRows(action: AuditAction, targetId?: string) {
    return db.prisma.auditLog.findMany({
      where: { action, ...(targetId === undefined ? {} : { targetId }) },
      orderBy: { id: 'asc' },
    });
  }

  async function createCustomRole(slug: string, rank: number) {
    const res = await http()
      .post(ROLES)
      .set(bearer(owner.token))
      .send({ slug, name: slug, rank });
    expect(res.status).toBe(201);
    return res.body as RoleBody;
  }

  describe('escalation matrix (D6, §12-7): all 403', () => {
    it('admin cannot manage another admin or that admin’s sessions', async () => {
      const other = await signedIn('admin');
      const patch = await http()
        .patch(`${ACCOUNTS}/${other.documentId}`)
        .set(bearer(admin.token))
        .send({ displayName: 'Renamed' });
      const disable = await http()
        .post(`${ACCOUNTS}/${other.documentId}/disable`)
        .set(bearer(admin.token));
      const revoke = await http()
        .post(`${ACCOUNTS}/${other.documentId}/sessions/revoke`)
        .set(bearer(admin.token));
      for (const res of [patch, disable, revoke]) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      }
      expect((await http().get(ME).set(bearer(other.token))).status).toBe(200);
    });

    it('admin cannot edit the admin role or its permissions', async () => {
      const permissions = await http()
        .put(`${ROLES}/${roleIds.admin}/permissions`)
        .set(bearer(admin.token))
        .send({ permissions: [] });
      const rename = await http()
        .patch(`${ROLES}/${roleIds.admin}`)
        .set(bearer(admin.token))
        .send({ name: 'Super admin' });
      const ownerRole = await http()
        .put(`${ROLES}/${roleIds.owner}/permissions`)
        .set(bearer(admin.token))
        .send({ permissions: [] });
      for (const res of [permissions, rename, ownerRole]) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      }
      const rows = await db.prisma.permission.count({
        where: { role: { slug: 'admin' } },
      });
      expect(rows).toBeGreaterThan(0);
    });

    it('admin cannot assign admin or owner, by invite or by update', async () => {
      const editor = await createAccount('editor');
      const attempts = await Promise.all([
        http().post(ACCOUNTS).set(bearer(admin.token)).send({
          email: 'new-owner@example.test',
          displayName: 'X',
          roleId: roleIds.owner,
        }),
        http().post(ACCOUNTS).set(bearer(admin.token)).send({
          email: 'new-admin@example.test',
          displayName: 'X',
          roleId: roleIds.admin,
        }),
        http()
          .patch(`${ACCOUNTS}/${editor.documentId}`)
          .set(bearer(admin.token))
          .send({ roleId: roleIds.admin }),
        http()
          .patch(`${ACCOUNTS}/${editor.documentId}`)
          .set(bearer(admin.token))
          .send({ roleId: roleIds.owner }),
      ]);
      for (const res of attempts) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      }
      const after = await db.prisma.account.findUniqueOrThrow({
        where: { id: editor.id },
      });
      expect(after.roleSlug).toBe('editor');
    });

    it('the owner cannot assign owner (only one owner) and nobody manages itself', async () => {
      const editor = await createAccount('editor');
      const assignOwner = await http()
        .patch(`${ACCOUNTS}/${editor.documentId}`)
        .set(bearer(owner.token))
        .send({ roleId: roleIds.owner });
      const ownerSelf = await http()
        .post(`${ACCOUNTS}/${owner.documentId}/sessions/revoke`)
        .set(bearer(owner.token));
      const adminSelf = await http()
        .patch(`${ACCOUNTS}/${admin.documentId}`)
        .set(bearer(admin.token))
        .send({ displayName: 'Me' });
      const adminOnOwner = await http()
        .post(`${ACCOUNTS}/${owner.documentId}/disable`)
        .set(bearer(admin.token));
      for (const res of [assignOwner, ownerSelf, adminSelf, adminOnOwner]) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      }
    });

    it('a custom role manager cannot create or raise a role to its own rank', async () => {
      const managers = await createCustomRole('t17-managers', 39);
      await http()
        .put(`${ROLES}/${managers.id}/permissions`)
        .set(bearer(owner.token))
        .send({
          permissions: [
            { subject: 'roles', action: 'read' },
            { subject: 'roles', action: 'create' },
            { subject: 'roles', action: 'update' },
          ],
        })
        .expect(200);
      const manager = await signedIn('t17-managers');
      const create = await http()
        .post(ROLES)
        .set(bearer(manager.token))
        .send({ slug: 't17-peer', name: 'Peer', rank: 39 });
      const lower = await createCustomRole('t17-lower', 12);
      const raise = await http()
        .patch(`${ROLES}/${lower.id}`)
        .set(bearer(manager.token))
        .send({ rank: 39 });
      for (const res of [create, raise]) {
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      }
    });

    it('admin cannot grant a system permission it lacks (audit_logs)', async () => {
      const role = await createCustomRole('t17-auditors', 15);
      const res = await http()
        .put(`${ROLES}/${role.id}/permissions`)
        .set(bearer(admin.token))
        .send({ permissions: [{ subject: 'audit_logs', action: 'read' }] });
      expect(res.status).toBe(403);
      expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.PERMISSION_NOT_HELD);
      expect(res.body).toMatchObject({ details: { indexes: [0] } });
    });

    it('an editor has no accounts or roles access; no token is 401', async () => {
      const editor = await signedIn('editor');
      for (const path of [ACCOUNTS, ROLES]) {
        const res = await http().get(path).set(bearer(editor.token));
        expect(res.status).toBe(403);
        expect(errorCodeOf(res)).toBe(ERROR_CODES.FORBIDDEN);
        expect((await http().get(path)).status).toBe(401);
      }
    });
  });

  describe('accounts', () => {
    it('lists accounts without secrets and marks what the actor may manage', async () => {
      const res = await http().get(ACCOUNTS).set(bearer(admin.token));
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const data = (
        res.body as {
          data: (Record<string, unknown> & {
            id: string;
            manageable: boolean;
          })[];
        }
      ).data;
      const byId = new Map(data.map((row) => [row.id, row]));
      expect(byId.get(owner.documentId)?.manageable).toBe(false);
      expect(byId.get(admin.documentId)?.manageable).toBe(false);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/passwordHash|totpSecret|tokenVersion|"id":\d/);
    });

    it('invite: 201, emails the invite code, audits invite + OTP, and the invitee can set a password', async () => {
      const email = 'Invitee@Example.test';
      const res = await http()
        .post(ACCOUNTS)
        .set(bearer(admin.token))
        .send({ email, displayName: 'Invitee', roleId: roleIds.editor });
      expect(res.status).toBe(201);
      const body = res.body as {
        id: string;
        email: string;
        status: string;
        invitationSent: boolean;
      };
      expect(body).toMatchObject({
        email: 'invitee@example.test',
        status: 'invited',
        invitationSent: true,
        role: { slug: 'editor' },
      });

      const message = mail.sent.filter((m) => m.to === body.email).at(-1);
      const code = message?.text.match(CODE_PATTERN)?.[0];
      expect(code).toBeDefined();

      const [invited] = await auditRows(AUDIT_ACTIONS.ACCOUNT_INVITED, body.id);
      expect(invited).toMatchObject({
        actorId: admin.id,
        actorType: 'account',
        subject: 'accounts',
        metadata: { role: 'editor' },
      });
      expect(invited?.ip).toMatch(/^10\.2\./);
      const [otp] = await auditRows(AUDIT_ACTIONS.AUTH_OTP_ISSUED, body.id);
      expect(otp).toMatchObject({
        actorId: admin.id,
        metadata: { purpose: 'INVITE_SET_PASSWORD' },
      });
      expect(JSON.stringify(otp?.metadata)).not.toContain(code);

      const set = await http()
        .post(SET_PASSWORD)
        .set('X-Forwarded-For', nextIp())
        .send({ email: body.email, code, newPassword: NEW_PASSWORD });
      expect(set.status).toBe(204);
      expect(await auditRows(AUDIT_ACTIONS.PASSWORD_SET, body.id)).toHaveLength(
        1,
      );
      expect((await login(body.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('invite: 409 for a taken email, 400 for bad input or an unassignable role', async () => {
      const taken = await http().post(ACCOUNTS).set(bearer(admin.token)).send({
        email: admin.email.toUpperCase(),
        displayName: 'Dup',
        roleId: roleIds.editor,
      });
      expect(taken.status).toBe(409);
      expect(errorCodeOf(taken)).toBe(
        MANAGEMENT_ERROR_CODES.ACCOUNT_EMAIL_TAKEN,
      );

      const invalid = await http()
        .post(ACCOUNTS)
        .set(bearer(admin.token))
        .send({ email: 'not-an-email', displayName: '', roleId: 'x' });
      expect(invalid.status).toBe(400);
      expect(errorCodeOf(invalid)).toBe(INVALID_REQUEST_ERROR.CODE);
      expect(JSON.stringify(invalid.body)).not.toContain('not-an-email');

      const reviewer = await http()
        .post(ACCOUNTS)
        .set(bearer(admin.token))
        .send({
          email: 'reviewer-x@example.test',
          displayName: 'R',
          roleId: roleIds.reviewer,
        });
      expect(reviewer.status).toBe(400);
      expect(errorCodeOf(reviewer)).toBe(
        MANAGEMENT_ERROR_CODES.ROLE_NOT_ASSIGNABLE,
      );

      const unknownRole = await http()
        .post(ACCOUNTS)
        .set(bearer(admin.token))
        .send({
          email: 'unknown-role@example.test',
          displayName: 'U',
          roleId: UNKNOWN_ID,
        });
      expect(unknownRole.status).toBe(404);
      expect(errorCodeOf(unknownRole)).toBe(
        MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
      );
    });

    it('update: email is not accepted; unknown or malformed ids fail', async () => {
      const editor = await createAccount('editor');
      const email = await http()
        .patch(`${ACCOUNTS}/${editor.documentId}`)
        .set(bearer(admin.token))
        .send({ email: 'other@example.test' });
      expect(email.status).toBe(400);
      const empty = await http()
        .patch(`${ACCOUNTS}/${editor.documentId}`)
        .set(bearer(admin.token))
        .send({});
      expect(empty.status).toBe(400);
      const unknown = await http()
        .patch(`${ACCOUNTS}/${UNKNOWN_ID}`)
        .set(bearer(admin.token))
        .send({ displayName: 'X' });
      expect(unknown.status).toBe(404);
      expect(errorCodeOf(unknown)).toBe(
        MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_FOUND,
      );
      const malformed = await http()
        .patch(`${ACCOUNTS}/42`)
        .set(bearer(admin.token))
        .send({ displayName: 'X' });
      expect(malformed.status).toBe(400);
    });

    it('update: rename + role change audit one row each and apply on the next request', async () => {
      const readers = await createCustomRole('t17-account-readers', 25);
      await http()
        .put(`${ROLES}/${readers.id}/permissions`)
        .set(bearer(owner.token))
        .send({ permissions: [{ subject: 'accounts', action: 'read' }] })
        .expect(200);
      const target = await signedIn('editor');
      expect(
        (await http().get(ACCOUNTS).set(bearer(target.token))).status,
      ).toBe(403);

      const res = await http()
        .patch(`${ACCOUNTS}/${target.documentId}`)
        .set(bearer(admin.token))
        .send({ displayName: 'Renamed', roleId: readers.id });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        displayName: 'Renamed',
        role: { slug: 't17-account-readers' },
      });

      // VersionCache invalidated: same token, new role.
      expect(
        (await http().get(ACCOUNTS).set(bearer(target.token))).status,
      ).toBe(200);
      const [renamed] = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_UPDATED,
        target.documentId,
      );
      expect(renamed?.metadata).toEqual({ fields: ['displayName'] });
      const [changed] = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGED,
        target.documentId,
      );
      expect(changed?.metadata).toEqual({
        fromRole: 'editor',
        toRole: 't17-account-readers',
      });
    });

    it('disable: 204, ends access and refresh at once, audited, then 409', async () => {
      const target = await signedIn('editor');
      const res = await http()
        .post(`${ACCOUNTS}/${target.documentId}/disable`)
        .set(bearer(admin.token));
      expect(res.status).toBe(204);
      expect((await http().get(ME).set(bearer(target.token))).status).toBe(401);
      const refresh = await http()
        .post(REFRESH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', target.refreshCookie);
      expect(refresh.status).toBe(401);
      expect((await login(target.email)).status).toBe(401);
      const rows = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_DISABLED,
        target.documentId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: admin.id, subject: 'accounts' });
      const [failed] = await auditRows(
        AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        target.documentId,
      );
      expect(failed?.metadata).toEqual({
        reason: LOGIN_FAILURE_REASONS.NOT_ACTIVE,
      });

      const again = await http()
        .post(`${ACCOUNTS}/${target.documentId}/disable`)
        .set(bearer(admin.token));
      expect(again.status).toBe(409);
      expect(errorCodeOf(again)).toBe(
        MANAGEMENT_ERROR_CODES.ACCOUNT_ALREADY_DISABLED,
      );
    });

    it('revoke sessions: 204, the target is signed out everywhere, audited', async () => {
      const target = await signedIn('editor');
      const res = await http()
        .post(`${ACCOUNTS}/${target.documentId}/sessions/revoke`)
        .set(bearer(admin.token));
      expect(res.status).toBe(204);
      expect((await http().get(ME).set(bearer(target.token))).status).toBe(401);
      const refresh = await http()
        .post(REFRESH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', target.refreshCookie);
      expect(refresh.status).toBe(401);
      expect((await login(target.email)).status).toBe(200);
      expect(
        await auditRows(
          AUDIT_ACTIONS.ACCOUNT_SESSIONS_REVOKED,
          target.documentId,
        ),
      ).toHaveLength(1);
    });
  });

  describe('enable and resend invite (T17a)', () => {
    async function invitedAccount(roleSlug = 'editor') {
      accountCount += 1;
      return db.prisma.account.create({
        data: {
          email: `t17a-invitee${accountCount}@example.test`,
          displayName: `Invitee ${accountCount}`,
          status: 'invited',
          role: { connect: { slug: roleSlug } },
        },
        select: { id: true, documentId: true, email: true },
      });
    }

    const codeFor = (email: string): string | undefined =>
      mail.sent
        .filter((m) => m.to === email)
        .at(-1)
        ?.text.match(CODE_PATTERN)?.[0];

    const disable = (actor: Signed, documentId: string) =>
      http().post(`${ACCOUNTS}/${documentId}/disable`).set(bearer(actor.token));
    const enable = (actor: Signed, documentId: string) =>
      http().post(`${ACCOUNTS}/${documentId}/enable`).set(bearer(actor.token));
    const resend = (actor: Signed, documentId: string) =>
      http()
        .post(`${ACCOUNTS}/${documentId}/invite/resend`)
        .set(bearer(actor.token));

    it('enable: a disabled account with a password is active again and can log in', async () => {
      const target = await signedIn('editor');
      expect((await disable(admin, target.documentId)).status).toBe(204);
      expect((await login(target.email)).status).toBe(401);

      const res = await enable(admin, target.documentId);
      expect(res.status).toBe(204);
      const row = await db.prisma.account.findUniqueOrThrow({
        where: { id: target.id },
        select: { status: true },
      });
      expect(row.status).toBe('active');
      expect((await login(target.email)).status).toBe(200);
      // The token issued before the disable stays dead (no token_version change).
      expect((await http().get(ME).set(bearer(target.token))).status).toBe(401);

      const [audit] = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_ENABLED,
        target.documentId,
      );
      expect(audit).toMatchObject({
        actorId: admin.id,
        subject: 'accounts',
        metadata: { status: 'active' },
      });
    });

    it('enable: a disabled account without a password goes back to invited', async () => {
      const target = await invitedAccount();
      expect((await disable(admin, target.documentId)).status).toBe(204);
      expect((await enable(admin, target.documentId)).status).toBe(204);
      const row = await db.prisma.account.findUniqueOrThrow({
        where: { id: target.id },
        select: { status: true },
      });
      expect(row.status).toBe('invited');
      const [audit] = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_ENABLED,
        target.documentId,
      );
      expect(audit?.metadata).toEqual({ status: 'invited' });
    });

    it('enable: 409 unless disabled; 403 for equal rank and for oneself; 404 for unknown ids', async () => {
      const editor = await signedIn('editor');
      const notDisabled = await enable(admin, editor.documentId);
      expect(notDisabled.status).toBe(409);
      expect(errorCodeOf(notDisabled)).toBe(
        MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_DISABLED,
      );
      const otherAdmin = await signedIn('admin');
      expect((await disable(owner, otherAdmin.documentId)).status).toBe(204);
      const peer = await enable(admin, otherAdmin.documentId);
      expect(peer.status).toBe(403);
      expect(errorCodeOf(peer)).toBe(MANAGEMENT_ERROR_CODES.RANK_FORBIDDEN);
      expect((await enable(admin, admin.documentId)).status).toBe(403);
      expect((await enable(admin, UNKNOWN_ID)).status).toBe(404);
      expect((await enable(admin, 'not-a-uuid')).status).toBe(400);
      expect(
        (await http().post(`${ACCOUNTS}/${editor.documentId}/enable`)).status,
      ).toBe(401);
      const noAccess = await enable(editor, editor.documentId);
      expect(noAccess.status).toBe(403);
    });

    it('resend: a new code sets the password, the old code stops working, audited', async () => {
      const inviter = await signedIn('admin');
      const target = await invitedAccount();
      expect((await resend(inviter, target.documentId)).status).toBe(200);
      const oldCode = codeFor(target.email);
      const res = await resend(inviter, target.documentId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ invitationSent: true });
      const newCode = codeFor(target.email);
      expect(newCode).toBeDefined();
      expect(newCode).not.toBe(oldCode);

      const setWith = (code: string | undefined) =>
        http()
          .post(SET_PASSWORD)
          .set('X-Forwarded-For', nextIp())
          .send({ email: target.email, code, newPassword: NEW_PASSWORD });
      const stale = await setWith(oldCode);
      expect(stale.status).toBe(400);
      expect(errorCodeOf(stale)).toBe('AUTH_INVALID_OTP');
      expect((await setWith(newCode)).status).toBe(204);
      expect((await login(target.email, NEW_PASSWORD)).status).toBe(200);

      const rows = await auditRows(
        AUDIT_ACTIONS.ACCOUNT_INVITE_RESENT,
        target.documentId,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        actorId: inviter.id,
        subject: 'accounts',
      });
    });

    it('resend: 409 for non-invited accounts; needs accounts:create; rank and self rules apply', async () => {
      const actor = await signedIn('admin');
      const active = await signedIn('editor');
      const notInvited = await resend(actor, active.documentId);
      expect(notInvited.status).toBe(409);
      expect(errorCodeOf(notInvited)).toBe(
        MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_INVITED,
      );
      expect((await resend(actor, actor.documentId)).status).toBe(403);
      expect((await resend(actor, UNKNOWN_ID)).status).toBe(404);
      const target = await invitedAccount();
      expect((await resend(active, target.documentId)).status).toBe(403);
      const sentBefore = mail.sent.length;
      const peerInvite = await invitedAccount('admin');
      expect((await resend(actor, peerInvite.documentId)).status).toBe(403);
      expect(mail.sent).toHaveLength(sentBefore);
    });

    it('resend: the hourly code cap answers 429 and leaves no audit row for the refused code', async () => {
      const inviter = await signedIn('admin');
      const target = await invitedAccount();
      // The account has no code yet: five resends fill the 5-per-hour cap.
      for (let i = 0; i < 5; i += 1) {
        expect((await resend(inviter, target.documentId)).status).toBe(200);
      }
      const refused = await resend(inviter, target.documentId);
      expect(refused.status).toBe(429);
      expect(
        await auditRows(AUDIT_ACTIONS.ACCOUNT_INVITE_RESENT, target.documentId),
      ).toHaveLength(5);
    });

    it('invite throttle: the 11th invite or resend by one caller is 429 with Retry-After, nothing written', async () => {
      const inviter = await signedIn('admin');
      const other = await signedIn('admin');
      const target = await invitedAccount();
      const invite = (actor: Signed, n: number) =>
        http()
          .post(ACCOUNTS)
          .set(bearer(actor.token))
          .send({
            email: `t17a-throttle-${actor.id}-${n}@example.test`,
            displayName: 'Throttled',
            roleId: roleIds.editor,
          });
      // Invite and resend share one counter: 5 + 5 = 10 allowed.
      for (let i = 0; i < 5; i += 1) {
        expect((await invite(inviter, i)).status).toBe(201);
      }
      for (let i = 0; i < 5; i += 1) {
        expect((await resend(inviter, target.documentId)).status).toBe(200);
      }
      const sentBefore = mail.sent.length;
      const accountsBefore = await db.prisma.account.count();
      const blocked = await invite(inviter, 99);
      expect(blocked.status).toBe(429);
      expect(errorCodeOf(blocked)).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await resend(inviter, target.documentId)).status).toBe(429);
      expect(mail.sent).toHaveLength(sentBefore);
      expect(await db.prisma.account.count()).toBe(accountsBefore);
      // Another caller keeps its own counter.
      expect((await invite(other, 0)).status).toBe(201);
    });
  });

  describe('invite throttle per IP (T17a)', () => {
    it('the 21st invite or resend from one IP is 429 even across callers', async () => {
      const callers = await Promise.all([
        signedIn('admin'),
        signedIn('admin'),
        signedIn('admin'),
      ]);
      const sharedIp = '10.9.9.9';
      const statuses: number[] = [];
      for (let i = 0; i < 21; i += 1) {
        const caller = callers[i % callers.length] as Signed;
        const res = await http()
          .post(ACCOUNTS)
          .set({ Authorization: `Bearer ${caller.token}` })
          .set('X-Forwarded-For', sharedIp)
          .send({
            email: `t17a-ip-${i}@example.test`,
            displayName: 'Ip limited',
            roleId: roleIds.editor,
          });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(
        true,
      );
      expect(statuses[20]).toBe(429);
    });
  });

  describe('accounts pagination (T17c)', () => {
    type Page = {
      data: { id: string }[];
      meta: { page: number; pageSize: number; total: number };
    };
    const pageOf = (query: string) =>
      http().get(`${ACCOUNTS}${query}`).set(bearer(owner.token));

    it('pages by offset with a stable order and a total that skips deleted accounts', async () => {
      const deleted = await createAccount('editor');
      await db.prisma.account.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      });
      const live = await db.prisma.account.count({
        where: { deletedAt: null },
      });
      for (let i = live; i < 25; i += 1) await createAccount('editor');
      const total = await db.prisma.account.count({
        where: { deletedAt: null },
      });

      const first = await pageOf('');
      expect(first.status).toBe(200);
      const firstBody = first.body as Page;
      expect(firstBody.meta).toEqual({ page: 1, pageSize: 20, total });
      expect(firstBody.data).toHaveLength(20);
      expect(firstBody.data.map((a) => a.id)).not.toContain(deleted.documentId);

      const second = (await pageOf('?page=2')).body as Page;
      expect(second.meta).toEqual({ page: 2, pageSize: 20, total });
      expect(second.data).toHaveLength(Math.min(20, total - 20));
      const ids = [...firstBody.data, ...second.data].map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);

      const small = (await pageOf('?pageSize=3&page=2')).body as Page;
      expect(small.data.map((a) => a.id)).toEqual(ids.slice(3, 6));
    });

    it('a page past the end is empty with the real total', async () => {
      const res = await pageOf('?page=999');
      expect(res.status).toBe(200);
      const body = res.body as Page;
      expect(body.data).toEqual([]);
      expect(body.meta.page).toBe(999);
      expect(body.meta.total).toBeGreaterThan(0);
    });

    it.each(['page=0', 'pageSize=101', 'pageSize=0', 'page=x', 'q=a'])(
      '400 ACCESS_INVALID_REQUEST for ?%s',
      async (query) => {
        const res = await pageOf(`?${query}`);
        expect(res.status).toBe(400);
        expect(errorCodeOf(res)).toBe(INVALID_REQUEST_ERROR.CODE);
      },
    );
  });

  describe('roles', () => {
    it('lists roles highest rank first with permissions; owner has no rows', async () => {
      const res = await http().get(ROLES).set(bearer(admin.token));
      expect(res.status).toBe(200);
      const data = (res.body as { data: RoleBody[] }).data;
      expect(data[0]).toMatchObject({ slug: 'owner', permissions: [] });
      const bySlug = new Map(data.map((role) => [role.slug, role]));
      expect(bySlug.get('admin')?.manageable).toBe(false);
      expect(bySlug.get('editor')?.manageable).toBe(true);
      expect(bySlug.get('editor')?.permissions.length).toBeGreaterThan(0);
    });

    it('create, rename and replace permissions: one audit row each', async () => {
      const created = await http()
        .post(ROLES)
        .set(bearer(admin.token))
        .send({ slug: 't17-writers', name: 'Writers', rank: 25 });
      expect(created.status).toBe(201);
      const role = created.body as RoleBody;
      expect(role).toMatchObject({
        rank: 25,
        accountCount: 0,
        permissions: [],
      });
      const [createdRow] = await auditRows(AUDIT_ACTIONS.ROLE_CREATED, role.id);
      expect(createdRow).toMatchObject({
        actorId: admin.id,
        subject: 'roles',
        metadata: { slug: 't17-writers', rank: 25 },
      });

      const dup = await http()
        .post(ROLES)
        .set(bearer(admin.token))
        .send({ slug: 'editor', name: 'Dup', rank: 25 });
      expect(dup.status).toBe(409);
      expect(errorCodeOf(dup)).toBe(MANAGEMENT_ERROR_CODES.ROLE_SLUG_TAKEN);

      const renamed = await http()
        .patch(`${ROLES}/${role.id}`)
        .set(bearer(admin.token))
        .send({ name: 'Authors' });
      expect(renamed.status).toBe(200);
      const [updatedRow] = await auditRows(AUDIT_ACTIONS.ROLE_UPDATED, role.id);
      expect(updatedRow?.metadata).toEqual({ fields: ['name'] });

      const replaced = await http()
        .put(`${ROLES}/${role.id}/permissions`)
        .set(bearer(admin.token))
        .send({
          permissions: [
            { subject: 'article', action: 'read', readableFields: ['title'] },
            { subject: 'media', action: 'read' },
          ],
        });
      expect(replaced.status).toBe(200);
      expect((replaced.body as RoleBody).permissions).toHaveLength(2);
      const [permRow] = await auditRows(
        AUDIT_ACTIONS.ROLE_PERMISSIONS_REPLACED,
        role.id,
      );
      expect(permRow?.metadata).toMatchObject({
        subjects: ['article', 'media'],
        permissionCount: 2,
      });
      // Names only: the field list itself is not in the audit row.
      expect(JSON.stringify(permRow?.metadata)).not.toContain('title');
    });

    it('rejects an invalid permission set with every issue in details', async () => {
      const role = await createCustomRole('t17-invalid', 20);
      const res = await http()
        .put(`${ROLES}/${role.id}/permissions`)
        .set(bearer(admin.token))
        .send({ permissions: [{ subject: 'nope', action: 'read' }] });
      expect(res.status).toBe(400);
      expect(errorCodeOf(res)).toBe(
        ACCESS_ERROR_CODES.PERMISSION_INVALID_SUBJECT,
      );
      expect(
        (res.body as { details: { issues: unknown[] } }).details.issues,
      ).toHaveLength(1);
    });

    it('a role permission change applies to holders on the next request', async () => {
      const role = await createCustomRole('t17-live', 18);
      const holder = await signedIn('t17-live');
      expect((await http().get(ROLES).set(bearer(holder.token))).status).toBe(
        403,
      );
      await http()
        .put(`${ROLES}/${role.id}/permissions`)
        .set(bearer(admin.token))
        .send({ permissions: [{ subject: 'roles', action: 'read' }] })
        .expect(200);
      expect((await http().get(ROLES).set(bearer(holder.token))).status).toBe(
        200,
      );
    });

    it('delete: 409 while held (with the count), 409 for system roles, 204 + audit otherwise', async () => {
      const role = await createCustomRole('t17-held', 16);
      const holder = await createAccount('t17-held');
      await db.prisma.account.update({
        where: { id: holder.id },
        data: { status: 'disabled', deletedAt: new Date() },
      });
      const held = await http()
        .delete(`${ROLES}/${role.id}`)
        .set(bearer(admin.token));
      expect(held.status).toBe(409);
      expect(held.body).toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_IN_USE,
        details: { accountCount: 1 },
      });

      const system = await http()
        .delete(`${ROLES}/${roleIds.editor}`)
        .set(bearer(owner.token));
      expect(system.status).toBe(409);
      expect(errorCodeOf(system)).toBe(
        MANAGEMENT_ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
      );
      const reRank = await http()
        .patch(`${ROLES}/${roleIds.editor}`)
        .set(bearer(owner.token))
        .send({ rank: 35 });
      expect(reRank.status).toBe(409);

      const free = await createCustomRole('t17-free', 14);
      const deleted = await http()
        .delete(`${ROLES}/${free.id}`)
        .set(bearer(admin.token));
      expect(deleted.status).toBe(204);
      expect(
        await db.prisma.role.findUnique({ where: { documentId: free.id } }),
      ).toBeNull();
      const [row] = await auditRows(AUDIT_ACTIONS.ROLE_DELETED, free.id);
      expect(row?.metadata).toEqual({ slug: 't17-free' });
    });

    it('caps custom roles at 50: the 51st is 409 ROLE_LIMIT_REACHED, system roles do not count', async () => {
      const existing = await db.prisma.role.count({
        where: { isSystem: false },
      });
      for (let i = existing; i < 50; i += 1) {
        await db.prisma.role.create({
          data: { slug: `t17c-cap-${i}`, name: `Cap ${i}`, rank: 15 },
        });
      }
      const res = await http()
        .post(ROLES)
        .set(bearer(owner.token))
        .send({ slug: 't17c-over', name: 'Over', rank: 15 });
      expect(res.status).toBe(409);
      expect(errorCodeOf(res)).toBe(MANAGEMENT_ERROR_CODES.ROLE_LIMIT_REACHED);
      expect(await db.prisma.role.count({ where: { slug: 't17c-over' } })).toBe(
        0,
      );
      const list = await http().get(ROLES).set(bearer(owner.token));
      expect((list.body as { data: unknown[] }).data.length).toBeGreaterThan(
        50,
      );
    });
  });

  describe('sign-in and password audit (§12-18)', () => {
    it('login success and wrong password are audited for the account', async () => {
      const account = await createAccount('editor');
      expect((await login(account.email, 'wrong password!!')).status).toBe(401);
      expect((await login(account.email)).status).toBe(200);
      const [failed] = await auditRows(
        AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        account.documentId,
      );
      expect(failed).toMatchObject({
        actorId: account.id,
        actorType: 'account',
        metadata: { reason: LOGIN_FAILURE_REASONS.BAD_PASSWORD },
      });
      const [ok] = await auditRows(
        AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
        account.documentId,
      );
      expect(ok).toMatchObject({
        actorId: account.id,
        metadata: { twoFactorMethod: null },
      });
    });

    it('an unknown email is audited without actor or raw email, with a keyed HMAC', async () => {
      const email = 'Nobody-T17@Example.test';
      expect((await login(email)).status).toBe(401);
      expect((await login(email.toLowerCase())).status).toBe(401);
      const rows = (await auditRows(AUDIT_ACTIONS.AUTH_LOGIN_FAILED)).filter(
        (row) => row.actorId === null,
      );
      expect(rows).toHaveLength(2);
      const [first, second] = rows as unknown as [
        { metadata: { reason: string; emailHmac: string }; targetId: unknown },
        { metadata: { emailHmac: string } },
      ];
      expect(first.targetId).toBeNull();
      expect(first.metadata.reason).toBe(LOGIN_FAILURE_REASONS.UNKNOWN_ACCOUNT);
      expect(first.metadata.emailHmac).toMatch(/^[0-9a-f]{64}$/);
      expect(second.metadata.emailHmac).toBe(first.metadata.emailHmac);
      expect(JSON.stringify(rows.map((row) => row.metadata))).not.toMatch(
        /nobody-t17/i,
      );
    });

    it('password change failure and success, logout and refresh reuse are audited', async () => {
      const account = await signedIn('editor');
      const wrong = await http()
        .post(CHANGE_PASSWORD)
        .set(bearer(account.token))
        .send({
          currentPassword: 'not the password',
          newPassword: NEW_PASSWORD,
        });
      expect(wrong.status).toBe(403);
      expect(
        await auditRows(
          AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
          account.documentId,
        ),
      ).toHaveLength(1);
      const changed = await http()
        .post(CHANGE_PASSWORD)
        .set(bearer(account.token))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(changed.status).toBe(204);
      expect(
        await auditRows(AUDIT_ACTIONS.PASSWORD_CHANGED, account.documentId),
      ).toHaveLength(1);

      const session = await login(account.email, NEW_PASSWORD);
      const cookie = ([] as string[])
        .concat(session.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith(`${REFRESH_COOKIE.NAME}=`))
        ?.split(';')[0];
      if (cookie === undefined) throw new Error('no refresh cookie');
      const refresh = () =>
        http()
          .post(REFRESH)
          .set('Origin', TEST_ADMIN_ORIGIN)
          .set('X-Forwarded-For', nextIp())
          .set('Cookie', cookie);
      expect((await refresh()).status).toBe(200);
      // Same token again, after the grace window would be reuse; force it by
      // backdating the rotation.
      await db.prisma.refreshToken.updateMany({
        where: { accountId: account.id, replacedById: { not: null } },
        data: { revokedAt: new Date(0) },
      });
      expect((await refresh()).status).toBe(401);
      expect(
        await auditRows(
          AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED,
          account.documentId,
        ),
      ).toHaveLength(1);

      const next = await login(account.email, NEW_PASSWORD);
      const nextCookie = ([] as string[])
        .concat(next.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith(`${REFRESH_COOKIE.NAME}=`))
        ?.split(';')[0];
      const logout = await http()
        .post('/api/v1/auth/logout')
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Cookie', nextCookie ?? '');
      expect(logout.status).toBe(204);
      expect(
        await auditRows(AUDIT_ACTIONS.AUTH_LOGOUT, account.documentId),
      ).toHaveLength(1);
    });
  });
});

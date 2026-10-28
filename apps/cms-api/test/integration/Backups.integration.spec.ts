import { HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { generate } from 'otplib';
import request from 'supertest';

import { MS_PER_MINUTE } from '../../src/common/constants/Time.constants';
import { Clock } from '../../src/common/time/Clock.service';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { SYSTEM_SUBJECT_ACTIONS } from '../../src/modules/access';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import {
  BACKUP_STORAGE,
  type BackupStorage,
  type StoredBackupObject,
} from '../../src/modules/backups';
import { BACKUPS_ERROR_CODES } from '../../src/modules/backups/domain/Backups.constants';
import { BACKUPS_RATE_LIMIT_POLICIES } from '../../src/modules/backups/http/Backups.controller';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import { AUTH_ERROR_CODES } from '../../src/modules/identity/domain/Identity.constants';
import {
  TURNSTILE_VERIFIER,
  type TurnstileVerifier,
} from '../../src/modules/reviewer/application/Reviewer.port';
import { AUDIT_ACTIONS } from '../../src/modules/security-audit';
import {
  ARTICLE_DEFINITION,
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_BACKUP_ENV,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_TOTP_ENC_KID,
  TEST_WEB_ORIGIN,
} from '../fixtures/Env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const PASSWORD = 'correct horse battery staple';
const BACKUPS = '/api/v1/backups';
const LINKS = `${BACKUPS}/download-links`;
const AUTH = '/api/v1/auth';
const OCTET_RANGE = 250;
/** Longer than every throttle window and a few TOTP steps. */
const CLOCK_STEP_MS = 11 * MS_PER_MINUTE;
const SIGNED_URL =
  'https://account.r2.example.test/abyss-backups/signed?sig=secret-sig';

const DAILY_KEY = 'postgres/daily/abyss-20261027T020000Z.dump.age';
const MONTHLY_KEY = 'postgres/monthly/abyss-20261001T020000Z.dump.age';
const OBJECTS: StoredBackupObject[] = [
  { key: DAILY_KEY, sizeBytes: 2048 },
  { key: MONTHLY_KEY, sizeBytes: 1024 },
  { key: 'postgres/daily/readme.txt', sizeBytes: 1 },
];

const fakeStorage: BackupStorage = {
  list: (prefix) =>
    Promise.resolve(OBJECTS.filter((object) => object.key.startsWith(prefix))),
  find: (key) =>
    Promise.resolve(OBJECTS.find((object) => object.key === key) ?? null),
  createDownloadUrl: () => Promise.resolve(SIGNED_URL),
};

const verifier = {
  isConfigured: true,
  verify: () => Promise.resolve('passed' as const),
} satisfies TurnstileVerifier;

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.41.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

describe('backups endpoints (D20, ADR 0013; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let unconfiguredApp: NestExpressApplication;
  let db: PrismaHandle;
  let owner: string;
  let ownerId: number;
  let totpSecret = '';
  let accountCount = 0;
  let clockOffset = 0;

  const realNow = Date.now.bind(Date);
  const now = () => realNow() + clockOffset;

  const bearer = (token: string, ip = nextIp()) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': ip,
  });
  const http = (target = app) => request(target.getHttpServer());
  const list = (token = owner) => http().get(BACKUPS).set(bearer(token));
  const link = (body: object, token = owner) =>
    http().post(LINKS).set(bearer(token)).send(body);
  const totpNow = () =>
    generate({ secret: totpSecret, epoch: Math.floor(now() / 1000) });
  const validBody = async (key = DAILY_KEY) => ({
    key,
    password: PASSWORD,
    code: await totpNow(),
  });
  const errorCodeOf = (res: request.Response) =>
    (res.body as { errorCode?: string }).errorCode;
  const auditRows = (action: string) =>
    db.prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

  async function signedIn(roleSlug: string): Promise<{
    token: string;
    id: number;
  }> {
    accountCount += 1;
    const email = `bk-user${accountCount}@example.test`;
    const account = await db.prisma.account.create({
      data: {
        email,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: roleSlug } },
      },
    });
    const res = await http()
      .post(`${AUTH}/login`)
      .set({ 'X-Forwarded-For': nextIp() })
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(HttpStatus.OK);
    return {
      token: (res.body as { accessToken: string }).accessToken,
      id: account.id,
    };
  }

  const appEnv = (databaseUrl: string, extra: Record<string, string> = {}) =>
    devEnv({
      ...dbEnvOf(databaseUrl),
      JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
      JWT_ACCESS_KID: TEST_JWT_KID,
      OTP_PEPPER: TEST_SECRET_32_BYTES,
      TOTP_ENC_KEY: TEST_SECRET_32_BYTES,
      TOTP_ENC_KID: TEST_TOTP_ENC_KID,
      ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      TRUST_PROXY_HOPS: '1',
      REVIEWER_FEATURE_ENABLED: 'true',
      ...extra,
    });

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION]);
    const overrides = [
      {
        token: ContentRegistry,
        value: { registry: () => Promise.resolve(registry) },
      },
      { token: TURNSTILE_VERIFIER, value: verifier },
    ];
    app = await createTestApp(appEnv(databaseUrl, TEST_BACKUP_ENV), [
      ...overrides,
      { token: BACKUP_STORAGE, value: fakeStorage },
    ]);
    unconfiguredApp = await createTestApp(appEnv(databaseUrl), overrides);
    for (const target of [app, unconfiguredApp]) {
      jest.spyOn(target.get(Clock), 'now').mockImplementation(now);
    }
    await app.listen(0, '127.0.0.1');
    const signedOwner = await signedIn('owner');
    owner = signedOwner.token;
    ownerId = signedOwner.id;
  });

  beforeEach(() => {
    clockOffset += CLOCK_STEP_MS;
  });

  afterAll(async () => {
    await app?.close();
    await unconfiguredApp?.close();
    await db?.close();
    await postgres?.stop();
  });

  describe('while the owner has no second factor', () => {
    it('refuses a link with 403 AUTH_2FA_NOT_ENABLED', async () => {
      const res = await link({ key: DAILY_KEY, password: PASSWORD, code: '' });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
      expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
    });
  });

  describe('with the owner signed in and TOTP on', () => {
    beforeAll(async () => {
      const setup = await http()
        .post(`${AUTH}/2fa/totp/setup`)
        .set(bearer(owner))
        .send();
      if (!setup.ok) throw new Error('totp setup failed');
      totpSecret = (setup.body as { secret: string }).secret;
      const enabled = await http()
        .post(`${AUTH}/2fa/enable`)
        .set(bearer(owner))
        .send({ method: 'totp', password: PASSWORD, code: await totpNow() });
      if (!enabled.ok) throw new Error('totp enable failed');
    });

    describe('GET /backups', () => {
      it('lists the dumps newest first with no-store and a summary', async () => {
        const res = await list();
        expect(res.status).toBe(HttpStatus.OK);
        expect(res.headers['cache-control']).toBe('no-store');
        const body = res.body as {
          data: {
            key: string;
            kind: string;
            fileName: string;
            createdAt: string;
            sizeBytes: number;
          }[];
          meta: {
            count: number;
            totalBytes: number;
            latestAt: string;
            isStale: boolean;
          };
        };
        expect(body.data.map((item) => item.key)).toEqual([
          DAILY_KEY,
          MONTHLY_KEY,
        ]);
        expect(body.data[0]).toEqual({
          key: DAILY_KEY,
          kind: 'daily',
          fileName: 'abyss-20261027T020000Z.dump.age',
          createdAt: '2026-10-27T02:00:00.000Z',
          sizeBytes: 2048,
        });
        expect(body.meta).toMatchObject({
          count: 2,
          totalBytes: 3072,
          latestAt: '2026-10-27T02:00:00.000Z',
        });
      });

      it('needs a session', async () => {
        const res = await http()
          .get(BACKUPS)
          .set({ 'X-Forwarded-For': nextIp() });
        expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
      });
    });

    describe('owner only', () => {
      async function refusedFor(token: string) {
        const listed = await list(token);
        const linked = await link(
          { key: DAILY_KEY, password: PASSWORD, code: '123456' },
          token,
        );
        return [listed.status, linked.status];
      }

      it('refuses an admin', async () => {
        const admin = await signedIn('admin');
        expect(await refusedFor(admin.token)).toEqual([
          HttpStatus.FORBIDDEN,
          HttpStatus.FORBIDDEN,
        ]);
      });

      it('refuses a custom role that holds every grant', async () => {
        const created = await http()
          .post('/api/v1/roles')
          .set(bearer(owner))
          .send({ slug: 'everything', name: 'everything', rank: 20 });
        expect(created.status).toBe(HttpStatus.CREATED);
        const roleId = (created.body as { id: string }).id;
        const permissions = Object.entries(SYSTEM_SUBJECT_ACTIONS).flatMap(
          ([subject, actions]) =>
            actions.map((action) => ({ subject, action })),
        );
        const put = await http()
          .put(`/api/v1/roles/${roleId}/permissions`)
          .set(bearer(owner))
          .send({ permissions });
        expect(put.status).toBe(HttpStatus.OK);
        const holder = await signedIn('everything');
        expect(await refusedFor(holder.token)).toEqual([
          HttpStatus.FORBIDDEN,
          HttpStatus.FORBIDDEN,
        ]);
      });

      it('refuses an API token', async () => {
        const created = await http()
          .post('/api/v1/api-tokens')
          .set(bearer(owner))
          .send({
            name: 'CI',
            scope: { permissions: [{ subject: 'article', action: 'read' }] },
          });
        expect(created.status).toBe(HttpStatus.CREATED);
        const { token } = created.body as { token: string };
        const statuses = await refusedFor(token);
        for (const status of statuses) {
          expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(
            status,
          );
        }
      });

      it('refuses a reviewer', async () => {
        const enabled = await http()
          .put('/api/v1/reviewer/settings')
          .set(bearer(owner))
          .send({ enabled: true });
        expect(enabled.status).toBe(HttpStatus.OK);
        const session = await http()
          .post('/api/v1/reviewer/sessions')
          .set({ 'X-Forwarded-For': nextIp() })
          .send({
            visitorRole: 'Recruiter',
            purposeTags: ['hiring'],
            notes: 'hello',
            turnstileToken: 'token',
          });
        expect(session.status).toBe(HttpStatus.CREATED);
        const { accessToken } = session.body as { accessToken: string };
        expect(await refusedFor(accessToken)).toEqual([
          HttpStatus.FORBIDDEN,
          HttpStatus.FORBIDDEN,
        ]);
      });
    });

    describe('POST /backups/download-links', () => {
      it('issues a link, writes one audit row and never stores the url', async () => {
        const before = (
          await auditRows(AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED)
        ).length;
        const res = await link(await validBody());
        expect(res.status).toBe(HttpStatus.CREATED);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toEqual({
          url: SIGNED_URL,
          fileName: 'abyss-20261027T020000Z.dump.age',
          expiresAt: expect.any(String) as string,
        });
        const rows = await auditRows(
          AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED,
        );
        expect(rows).toHaveLength(before + 1);
        const row = rows.at(-1);
        expect(row).toMatchObject({
          actorId: ownerId,
          targetId: 'abyss-20261027T020000Z.dump.age',
          metadata: { kind: 'daily', sizeBytes: 2048 },
        });
        expect(JSON.stringify(row?.metadata)).not.toContain('secret-sig');
      });

      it('answers 403 and one auth.reauth_failed row for a wrong password', async () => {
        const before = (await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED))
          .length;
        const res = await link({
          ...(await validBody()),
          password: 'not the password!!',
        });
        expect(res.status).toBe(HttpStatus.FORBIDDEN);
        expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
        const rows = await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED);
        expect(rows).toHaveLength(before + 1);
        expect(rows.at(-1)?.metadata).toEqual({
          purpose: 'backup_download',
          reason: 'bad_password',
        });
      });

      it('answers 403 and one auth.reauth_failed row for a wrong code', async () => {
        const before = (await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED))
          .length;
        const res = await link({
          key: DAILY_KEY,
          password: PASSWORD,
          code: '000000',
        });
        expect(res.status).toBe(HttpStatus.FORBIDDEN);
        expect(errorCodeOf(res)).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
        const rows = await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED);
        expect(rows).toHaveLength(before + 1);
        expect(rows.at(-1)?.metadata).toEqual({
          purpose: 'backup_download',
          reason: 'bad_code',
        });
      });

      it('answers 404 BACKUP_NOT_FOUND for an unknown key and writes no link row', async () => {
        const before = (
          await auditRows(AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED)
        ).length;
        const res = await link(
          await validBody('postgres/daily/abyss-20200101T000000Z.dump.age'),
        );
        expect(res.status).toBe(HttpStatus.NOT_FOUND);
        expect(errorCodeOf(res)).toBe(BACKUPS_ERROR_CODES.NOT_FOUND);
        expect(
          await auditRows(AUDIT_ACTIONS.BACKUP_DOWNLOAD_LINK_CREATED),
        ).toHaveLength(before);
      });

      it('answers 400 for a key outside the prefix, before re-authentication', async () => {
        const before = (await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED))
          .length;
        const res = await link({
          key: 'other/daily/abyss-20261027T020000Z.dump.age',
          password: 'not the password!!',
          code: '000000',
        });
        expect(res.status).toBe(HttpStatus.BAD_REQUEST);
        expect(await auditRows(AUDIT_ACTIONS.AUTH_REAUTH_FAILED)).toHaveLength(
          before,
        );
      });

      it('answers 400 for a key with a parent segment', async () => {
        const res = await link(
          await validBody(
            'postgres/daily/../daily/abyss-20261027T020000Z.dump.age',
          ),
        );
        expect(res.status).toBe(HttpStatus.BAD_REQUEST);
      });

      it('answers 429 on the 6th link request of one owner in the window', async () => {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 6; attempt += 1) {
          statuses.push(
            (await link({ key: 'bad', password: 'x', code: '' })).status,
          );
        }
        expect(statuses.slice(0, 5)).toEqual(
          Array(5).fill(HttpStatus.BAD_REQUEST),
        );
        expect(statuses[5]).toBe(HttpStatus.TOO_MANY_REQUESTS);
      });

      it('answers 429 for the 11th request from one IP across accounts', async () => {
        const [ipRule] = BACKUPS_RATE_LIMIT_POLICIES.BACKUP_LINK;
        const callers = [
          await signedIn('admin'),
          await signedIn('admin'),
          await signedIn('admin'),
        ];
        const ip = nextIp();
        const statuses: number[] = [];
        for (let attempt = 0; attempt <= ipRule.maxHits; attempt += 1) {
          const caller = callers[attempt % callers.length];
          const res = await http()
            .post(LINKS)
            .set(bearer(caller?.token ?? '', ip))
            .send({ key: 'bad', password: 'x', code: '' });
          statuses.push(res.status);
        }
        expect(statuses.slice(0, ipRule.maxHits)).not.toContain(
          HttpStatus.TOO_MANY_REQUESTS,
        );
        expect(statuses.at(-1)).toBe(HttpStatus.TOO_MANY_REQUESTS);
      });
    });
  });

  describe('with the backup keys unset', () => {
    it('answers 404 BACKUPS_NOT_CONFIGURED on both routes', async () => {
      const listed = await http(unconfiguredApp)
        .get(BACKUPS)
        .set(bearer(owner));
      expect(listed.status).toBe(HttpStatus.NOT_FOUND);
      expect(errorCodeOf(listed)).toBe(BACKUPS_ERROR_CODES.NOT_CONFIGURED);
      const linked = await http(unconfiguredApp)
        .post(LINKS)
        .set(bearer(owner))
        .send({ key: DAILY_KEY, password: PASSWORD, code: '123456' });
      expect(linked.status).toBe(HttpStatus.NOT_FOUND);
      expect(errorCodeOf(linked)).toBe(BACKUPS_ERROR_CODES.NOT_CONFIGURED);
    });
  });
});

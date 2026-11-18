import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';

import { Clock } from '../../src/common/time/Clock.service';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import {
  REFRESH_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_REFRESH_TOKEN_TTL_MS,
} from '../../src/modules/identity/domain/Identity.constants';
import { REFRESH_COOKIE } from '../../src/modules/identity/http/IdentityHttp.constants';
import { seedSystemRoles } from '../fixtures/Access.fixture';
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

const MIGRATION_SQL = join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '20261106090000_refresh_token_remember_me',
  'migration.sql',
);
const EXPIRES_AT = '2027-01-01T00:00:00.000Z';

describe('refresh token remember_me migration (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let client: Client;
  let db: PrismaHandle;
  let accountId: number;
  let migrationSql: string;

  async function insertLegacyToken(): Promise<void> {
    await client.query(
      `INSERT INTO refresh_tokens (account_id, family_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [accountId, randomUUID(), randomUUID(), EXPIRES_AT],
    );
  }

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    const account = await db.prisma.account.create({
      data: {
        email: 'remember@example.test',
        displayName: 'Remember',
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true },
    });
    accountId = account.id;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    migrationSql = await readFile(MIGRATION_SQL, 'utf8');
    // Back to the schema before the migration: rows written then have no column.
    await client.query('ALTER TABLE refresh_tokens DROP COLUMN remember_me');
    await insertLegacyToken();
    await insertLegacyToken();
  });

  afterAll(async () => {
    await client?.end();
    await db?.close();
    await postgres?.stop();
  });

  it('reads every existing row as remembered and changes no other column', async () => {
    const before = await client.query('SELECT * FROM refresh_tokens ORDER BY id');
    await client.query(migrationSql);
    const { rows } = await client.query<Record<string, unknown>>(
      'SELECT * FROM refresh_tokens ORDER BY id',
    );

    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      const { remember_me: rememberMe, ...rest } = row;
      expect(rememberMe).toBe(true);
      expect(rest).toEqual(before.rows[index]);
    }
  });

  it('keeps an explicit false and defaults an omitted value to true', async () => {
    await db.prisma.refreshToken.create({
      data: {
        accountId,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(EXPIRES_AT),
        rememberMe: false,
      },
    });
    await client.query(
      `INSERT INTO refresh_tokens (account_id, family_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [accountId, randomUUID(), randomUUID(), EXPIRES_AT],
    );

    const { rows } = await client.query<{ remember_me: boolean }>(
      'SELECT remember_me FROM refresh_tokens ORDER BY id DESC LIMIT 2',
    );
    expect(rows.map((row) => row.remember_me)).toEqual([true, false]);
  });
});

const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const PASSWORD = 'correct horse battery staple';
const ONE_SECOND_MS = 1000;

function refreshCookieOf(res: request.Response): string {
  const raw = ([] as string[]).concat(
    (res.headers['set-cookie'] as string[] | string | undefined) ?? [],
  );
  const header = raw.find((c) => c.startsWith(`${REFRESH_COOKIE.NAME}=`));
  if (header === undefined) throw new Error('no refresh cookie set');
  return header;
}

function tokenOf(setCookie: string): string {
  return (setCookie.split(';')[0] ?? '').slice(REFRESH_COOKIE.NAME.length + 1);
}

function attributesOf(setCookie: string): string[] {
  return setCookie
    .split(';')
    .slice(1)
    .map((part) => part.trim().split('=')[0]?.toLowerCase() ?? '');
}

describe('remember me: lifetime and cookie mode (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let accountCount = 0;
  let now = 0;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  async function createAccount() {
    accountCount += 1;
    return db.prisma.account.create({
      data: {
        email: `rm-user${accountCount}@example.test`,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'editor' } },
      },
      select: { id: true, documentId: true, email: true },
    });
  }

  async function signIn(rememberMe: boolean) {
    const account = await createAccount();
    const res = await request(app.getHttpServer())
      .post(LOGIN)
      .set('X-Forwarded-For', `10.9.0.${accountCount}`)
      .send({ email: account.email, password: PASSWORD, rememberMe });
    expect(res.status).toBe(200);
    return { account, setCookie: refreshCookieOf(res) };
  }

  function refresh(token: string) {
    return request(app.getHttpServer())
      .post(REFRESH)
      .set('Origin', TEST_ADMIN_ORIGIN)
      .set('Cookie', `${REFRESH_COOKIE.NAME}=${token}`);
  }

  it('remembered: persistent 30-day cookie, row and audit say so', async () => {
    const { account, setCookie } = await signIn(true);
    expect(setCookie).toContain(`; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`);
    expect(attributesOf(setCookie)).toContain('expires');
    const row = await db.prisma.refreshToken.findFirstOrThrow({ where: { accountId: account.id } });
    expect(row.rememberMe).toBe(true);
    expect(row.expiresAt.getTime() - now).toBe(REFRESH_TOKEN_TTL_MS);
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.login_succeeded', targetId: account.documentId },
    });
    expect(audit.metadata).toEqual({ twoFactorMethod: null, rememberMe: true });
  });

  it('not remembered: session cookie, 12 h row, audit says so', async () => {
    const { account, setCookie } = await signIn(false);
    const attributes = attributesOf(setCookie);
    expect(attributes).not.toContain('max-age');
    expect(attributes).not.toContain('expires');
    const row = await db.prisma.refreshToken.findFirstOrThrow({ where: { accountId: account.id } });
    expect(row.rememberMe).toBe(false);
    expect(row.expiresAt.getTime() - now).toBe(SESSION_REFRESH_TOKEN_TTL_MS);
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.login_succeeded', targetId: account.documentId },
    });
    expect(audit.metadata).toEqual({ twoFactorMethod: null, rememberMe: false });
  });

  it('refresh keeps the mode of the rotated row in the cookie', async () => {
    for (const rememberMe of [true, false]) {
      const { setCookie } = await signIn(rememberMe);
      const res = await refresh(tokenOf(setCookie));
      expect(res.status).toBe(200);
      const attributes = attributesOf(refreshCookieOf(res));
      expect(attributes.includes('max-age')).toBe(rememberMe);
    }
  });

  it('a not-remembered token is refused after 12 h + 1 s and the cookie is cleared', async () => {
    const { setCookie } = await signIn(false);
    now += SESSION_REFRESH_TOKEN_TTL_MS + ONE_SECOND_MS;
    const res = await refresh(tokenOf(setCookie));
    expect(res.status).toBe(401);
    expect(refreshCookieOf(res)).toContain(`${REFRESH_COOKIE.NAME}=;`);
  });

  it('a remembered token rotates at 12 h + 1 s and is refused 30 days + 1 s after its last rotation', async () => {
    const { setCookie } = await signIn(true);
    now += SESSION_REFRESH_TOKEN_TTL_MS + ONE_SECOND_MS;
    const rotated = await refresh(tokenOf(setCookie));
    expect(rotated.status).toBe(200);
    now += REFRESH_TOKEN_TTL_MS + ONE_SECOND_MS;
    const expired = await refresh(tokenOf(refreshCookieOf(rotated)));
    expect(expired.status).toBe(401);
  });
});

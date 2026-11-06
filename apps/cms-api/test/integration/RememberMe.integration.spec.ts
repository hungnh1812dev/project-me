import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Client } from 'pg';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { seedSystemRoles } from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';

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

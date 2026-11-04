import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Client } from 'pg';

import { sha256Hex, storedFileNameOf } from '../../src/modules/media/domain/MediaUpload.rules';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import { legacyMediaRows } from '../fixtures/Media.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';

const MIGRATION_SQL = join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '20261103090000_media_stored_file_name',
  'migration.sql',
);
const SEEDED_UPDATED_AT = '2026-01-02T03:04:05.000Z';

interface StoredRow {
  file_name: string;
  storage_key: string;
  url: string;
  sha256: string;
  updated_at: Date;
}

describe('media stored file name migration (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let client: Client;
  let migrationSql: string;
  const expectedNameByLabel = new Map<string, string>();

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    client = new Client({ connectionString: await template.fresh() });
    await client.connect();
    migrationSql = await readFile(MIGRATION_SQL, 'utf8');

    for (const row of legacyMediaRows()) {
      const sha256 = sha256Hex(Buffer.from(row.label));
      expectedNameByLabel.set(row.label, storedFileNameOf(row.fileName, sha256, row.mimeType));
      await client.query(
        `INSERT INTO file_library
           (document_id, file_name, mime_type, size, storage_key, sha256, url, provider, deleted_at, updated_at)
         VALUES ($8, $1, $2, 1, $3, $4, $5, 'local', $6, $7)`,
        [
          row.fileName,
          row.mimeType,
          randomUUID(),
          sha256,
          `https://fake-media.invalid/${randomUUID()}`,
          row.isTombstone === true ? SEEDED_UPDATED_AT : null,
          SEEDED_UPDATED_AT,
          randomUUID(),
        ],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
    await postgres?.stop();
  });

  async function rowsBySha(): Promise<Map<string, StoredRow>> {
    const { rows } = await client.query<StoredRow>(
      'SELECT file_name, storage_key, url, sha256, updated_at FROM file_library',
    );
    return new Map(rows.map((row) => [row.sha256, row]));
  }

  it('renames every row exactly as storedFileNameOf names it, changing only file_name', async () => {
    const before = await rowsBySha();
    await client.query(migrationSql);
    const after = await rowsBySha();

    for (const [label, expectedName] of expectedNameByLabel) {
      const sha256 = sha256Hex(Buffer.from(label));
      const row = after.get(sha256);
      expect({ label, fileName: row?.file_name }).toEqual({ label, fileName: expectedName });
      expect({ ...row, file_name: '' }).toEqual({ ...before.get(sha256), file_name: '' });
    }
    expect(expectedNameByLabel.get('255-character name')).toHaveLength(255);
    expect(expectedNameByLabel.get('multi-byte 255-character name')).toHaveLength(255);
  });

  it('changes no row when run a second time', async () => {
    const before = await rowsBySha();
    const result = await client.query(migrationSql);
    expect(result.rowCount).toBe(0);
    expect(await rowsBySha()).toEqual(before);
  });
});

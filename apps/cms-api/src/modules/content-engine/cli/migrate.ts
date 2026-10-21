import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import { loadAppConfig } from '../../../config/app-config';
import {
  type DatabaseConnection,
  poolOptionsOf,
} from '../../../infrastructure/database/database-config';
import {
  type ContentMetaDatabase,
  type MigrateResult,
  runContentMigrations,
} from '../migration-runner';
import { DEFAULT_CONTENT_PATHS } from './content-paths';

/** One connection is enough: everything runs in a single transaction. */
const MIGRATE_POOL_SIZE = 1;

export function createMigrationDb(
  connection: DatabaseConnection,
): Kysely<ContentMetaDatabase> {
  return new Kysely<ContentMetaDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({ ...poolOptionsOf(connection), max: MIGRATE_POOL_SIZE }),
    }),
  });
}

function report(result: MigrateResult): string {
  const applied =
    result.applied.length > 0
      ? `Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}.`
      : 'No pending content migrations.';
  const synced = [
    result.upserted.length > 0
      ? `Updated content types: ${result.upserted.join(', ')}.`
      : '',
    result.removed.length > 0
      ? `Removed content types: ${result.removed.join(', ')}.`
      : '',
  ].filter((line) => line !== '');
  return [applied, ...synced].join('\n');
}

async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  const db = createMigrationDb(config.database);
  try {
    const result = await runContentMigrations(
      db,
      DEFAULT_CONTENT_PATHS.migrationsDir,
    );
    process.stdout.write(`${report(result)}\n`);
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

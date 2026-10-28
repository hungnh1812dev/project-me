import { loadDatabaseConfig } from '../../../config/AppConfig.setup';
import {
  type MigrateResult,
  runContentMigrations,
} from '../adapters/MigrationRunner.adapter';
import { DEFAULT_CONTENT_PATHS } from '../adapters/MigrationFiles.adapter';
import { createMigrationDb } from './ContentEngineCli.setup';

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
  const database = loadDatabaseConfig(process.env);
  const db = createMigrationDb(database);
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

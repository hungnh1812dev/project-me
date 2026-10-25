import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import {
  type DatabaseConnection,
  poolOptionsOf,
} from '../../../infrastructure/database/database-config';
import { MIGRATION_POOL_MAX_CONNECTIONS } from './ContentEnginePersistence.constants';
import type { ContentMetaDatabase } from './MigrationRunner.adapter';

/** A Kysely handle on the engine's bookkeeping tables; the caller destroys it. */
export function createMigrationDb(
  connection: DatabaseConnection,
): Kysely<ContentMetaDatabase> {
  const pool = new Pool({
    ...poolOptionsOf(connection),
    max: MIGRATION_POOL_MAX_CONNECTIONS,
  });
  // An idle-client error must not crash the process (the next query reports it).
  pool.on('error', () => undefined);
  return new Kysely<ContentMetaDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { type ClientConfig, Pool, types } from 'pg';

import { type IAppConfig } from '../../../config/AppConfig.setup';
import { APP_CONFIG } from '../../../config/Config.constants';
import {
  type DatabaseConnection,
  poolOptionsOf,
} from '../../../infrastructure/database/DatabaseConfig.rules';
import type { ContentMetaDatabase } from './MigrationRunner.adapter';
import type { ContentDatabase } from './TreeLoader.adapter';

/** Key for `pg_advisory_xact_lock`: serialises concurrent `content:migrate` runs. */
export const MIGRATION_LOCK_KEY = 7_163_201_906;

export const MIGRATION_FILE_EXTENSION = '.sql';
export const MIGRATION_SNAPSHOT_FILE = 'snapshot.json';
export const SCHEMA_FILE_EXTENSION = '.json';
/** `0001_<label>.sql`: zero-padded sequence keeps lexical order = apply order. */
export const MIGRATION_SEQUENCE_DIGITS = 4;
export const MIGRATION_LABEL_PATTERN = /^[a-z0-9_]+$/;
export const DEFAULT_MIGRATION_LABEL = 'content';
export const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;

/** Postgres errors meaning `content:migrate` never ran on this database. */
export const CONTENT_NOT_MIGRATED_PG_CODES: readonly string[] = [
  '42P01', // undefined_table
  '3F000', // invalid_schema_name
];

/** Most connections of the app's content pool (reads of the document API). */
export const CONTENT_POOL_MAX_CONNECTIONS = 10;

/** Connections of the migration pool: everything runs in a single transaction. */
export const MIGRATION_POOL_MAX_CONNECTIONS = 1;

/** Name of the savepoint `ContentTransactionRunner.runInSavepoint` opens. */
export const CONTENT_STEP_SAVEPOINT = 'content_step';

const keepText = (value: string): string => value;

/**
 * `date` columns come back as the text Postgres sends (`2026-03-01`), not a
 * JS Date: a Date is midnight in the server's time zone and would shift the
 * calendar day when serialized to UTC (decided for date columns). Every other type
 * keeps pg's default parser.
 */
const DATE_OID: number = types.builtins.DATE;

type PgTypes = NonNullable<ClientConfig['types']>;

/**
 * Pool-level parsers: only this pool is affected, never pg's global ones.
 * (`pg` passes `(oid, format)` through; only `date` is replaced.)
 */
export const CONTENT_TYPE_PARSERS: PgTypes = {
  getTypeParser: ((
    oid: number,
    format?: 'text' | 'binary',
  ): ((value: string) => unknown) =>
    oid === DATE_OID
      ? keepText
      : (types.getTypeParser(oid, format) as (
          value: string,
        ) => unknown)) as PgTypes['getTypeParser'],
};

export function createContentDb(
  connection: DatabaseConnection,
): Kysely<ContentDatabase> {
  const pool = new Pool({
    ...poolOptionsOf(connection),
    max: CONTENT_POOL_MAX_CONNECTIONS,
    types: CONTENT_TYPE_PARSERS,
  });
  // An idle-client error must not crash the process (the next query reports it).
  pool.on('error', () => undefined);
  return new Kysely<ContentDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}

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

/**
 * The app's connection to the generated content tables (Kysely, no Prisma).
 * Connects lazily on first query, so the API boots with the database down.
 */
@Injectable()
export class ContentDbProvider implements OnModuleDestroy {
  readonly db: Kysely<ContentDatabase>;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.db = createContentDb(config.database);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

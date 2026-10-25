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

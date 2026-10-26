import type { PoolConfig } from 'pg';

/**
 * PostgreSQL connection settings, read from DB_HOST, DB_PORT, DB_NAME,
 * DB_USERNAME and DB_PASSWORD. Kept as separate fields (never joined into a
 * URL) so a password with reserved characters needs no encoding.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * What the pool factories accept. The URL form exists for tests and tooling
 * that get a ready connection string (Testcontainers); the app itself always
 * passes a `DatabaseConfig`.
 */
export type DatabaseConnection = DatabaseConfig | string;

/** `pg` pool options for a connection; fields go to `pg` as they are. */
export function poolOptionsOf(connection: DatabaseConnection): PoolConfig {
  if (typeof connection === 'string') return { connectionString: connection };
  const { host, port, database, user, password } = connection;
  return { host, port, database, user, password };
}

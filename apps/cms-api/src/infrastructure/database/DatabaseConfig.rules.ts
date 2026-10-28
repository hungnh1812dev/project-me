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
  /** DB_SSL_MODE other than `disable`; absent = plain connection. */
  tls?: DatabaseTls;
}

/**
 * `require` encrypts without checking the server (an encrypted-only
 * transport); `verify-full` also checks the certificate chain against the
 * given CA and that the certificate matches `host`.
 */
export type DatabaseTls =
  { mode: 'require' } | { mode: 'verify-full'; rootCertificatePem: string };

/**
 * What the pool factories accept. The URL form exists for tests and tooling
 * that get a ready connection string (Testcontainers); the app itself always
 * passes a `DatabaseConfig`.
 */
export type DatabaseConnection = DatabaseConfig | string;

/** `pg` pool options for a connection; fields go to `pg` as they are. */
export function poolOptionsOf(connection: DatabaseConnection): PoolConfig {
  if (typeof connection === 'string') return { connectionString: connection };
  const { host, port, database, user, password, tls } = connection;
  const options: PoolConfig = { host, port, database, user, password };
  if (tls?.mode === 'require') {
    options.ssl = { rejectUnauthorized: false };
  } else if (tls?.mode === 'verify-full') {
    options.ssl = { ca: tls.rootCertificatePem, rejectUnauthorized: true };
  }
  return options;
}

/** Schemas the app's tables live in; the DDL check looks only at these. */
export const APP_SCHEMAS = ['public', 'content'] as const;

/** What the boot check reads about the connected role (ADR 0012 section 7). */
export interface DatabaseRoleFacts {
  isSuperuser: boolean;
  canCreateInDatabase: boolean;
  schemasWithCreate: readonly string[];
  schemasWithOwnedObjects: readonly string[];
  /** Roles the connected role is a direct member of (they can carry DDL or server rights). */
  memberOfRoles: readonly string[];
}

/** The problems found, by name; never a role name, host or other value. */
export function ddlRiskNamesOf(facts: DatabaseRoleFacts): string[] {
  const names: string[] = [];
  if (facts.isSuperuser) names.push('superuser');
  if (facts.canCreateInDatabase) names.push('CREATE on the database');
  for (const schema of facts.schemasWithCreate) {
    names.push(`CREATE on schema ${schema}`);
  }
  for (const schema of facts.schemasWithOwnedObjects) {
    names.push(`owns objects in schema ${schema}`);
  }
  for (const role of facts.memberOfRoles) {
    names.push(`member of role ${role}`);
  }
  return names;
}

const ADR_POINTER = 'See docs/adr/0012-database-role-separation.md.';

export function ddlRiskWarningOf(riskNames: readonly string[]): string {
  return `The database role can change the schema (${riskNames.join('; ')}); production should run as a DML-only role. ${ADR_POINTER}`;
}

export const DDL_CHECK_FAILED_WARNING = `Could not check whether the database role can change the schema. ${ADR_POINTER}`;

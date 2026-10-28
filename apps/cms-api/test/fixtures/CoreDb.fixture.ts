import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Client } from 'pg';

import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { dbEnvOf } from './Env.fixture';

const run = promisify(execFile);
const APP_ROOT = join(__dirname, '..', '..');
const ROLES_SCRIPT = join(
  APP_ROOT,
  '..',
  '..',
  'scripts',
  'db',
  'database-roles.sql',
);
const PRISMA_BIN = join(APP_ROOT, 'node_modules', '.bin', 'prisma');

/** Runs `prisma migrate deploy` (the real db:migrate path) against `databaseUrl`. */
export async function migrateCore(databaseUrl: string): Promise<void> {
  await run(PRISMA_BIN, ['migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: { ...process.env, ...dbEnvOf(databaseUrl) },
  });
}

async function admin<T>(
  serverUrl: string,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

function withDatabase(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * A migrated template database; `fresh()` clones it (CREATE DATABASE ...
 * TEMPLATE), so each test gets an isolated, already-migrated core schema.
 */
export async function createCoreTemplate(serverUrl: string) {
  const template = `tpl_${randomUUID().replace(/-/g, '')}`;
  await admin(serverUrl, (client) =>
    client.query(`CREATE DATABASE "${template}"`),
  );
  await migrateCore(withDatabase(serverUrl, template));
  return {
    fresh: async (): Promise<string> => {
      const database = `t_${randomUUID().replace(/-/g, '')}`;
      await admin(serverUrl, (client) =>
        client.query(`CREATE DATABASE "${database}" TEMPLATE "${template}"`),
      );
      return withDatabase(serverUrl, database);
    },
  };
}

/** The three roles of ADR 0012, with the names a suite picked. */
export interface DatabaseRoleNames {
  migrator: string;
  api: string;
  backup: string;
}

export interface ApplyDatabaseRolesOptions {
  /** Defaults to `self_managed`. */
  hosting?: string;
  /** Connects as this role instead of the server's superuser. */
  connectAs?: { user: string; password: string } | undefined;
  /** Extra psql variables; an `undefined` value leaves the variable unset. */
  extraVariables?: Record<string, string | undefined>;
}

const ROLES_SCRIPT_PASSED_NOTICE = 'database roles self-check passed';

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Stands in for `psql -v name=value`: replaces `:'name'` (literal) and
 * `:"name"` (identifier), reads an unset variable as '' (the script's own
 * `\if :{?name}` defaults) and drops the psql meta-command lines.
 */
function expandPsqlVariables(
  script: string,
  variables: Record<string, string | undefined>,
): string {
  return script
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n')
    .replace(/:(['"])([a-z_]+)\1/g, (_match, quote: string, name: string) =>
      quote === "'"
        ? quoteLiteral(variables[name] ?? '')
        : quoteIdentifier(variables[name] ?? ''),
    );
}

/**
 * Runs scripts/db/database-roles.sql on `database`, as the server's superuser
 * or as `connectAs`. Rejects with the script's error, or when the self-check
 * did not report success.
 */
export async function applyDatabaseRoles(
  serverUrl: string,
  database: string,
  roles: DatabaseRoleNames,
  options: ApplyDatabaseRolesOptions = {},
): Promise<void> {
  const script = expandPsqlVariables(await readFile(ROLES_SCRIPT, 'utf8'), {
    hosting: options.hosting ?? 'self_managed',
    migrator_role: roles.migrator,
    api_role: roles.api,
    backup_role: roles.backup,
    ...options.extraVariables,
  });
  const url = new URL(withDatabase(serverUrl, database));
  if (options.connectAs !== undefined) {
    url.username = options.connectAs.user;
    url.password = options.connectAs.password;
  }
  const client = new Client({ connectionString: url.toString() });
  let selfCheckPassed = false;
  client.on('notice', (notice) => {
    selfCheckPassed ||= (notice.message ?? '').startsWith(
      ROLES_SCRIPT_PASSED_NOTICE,
    );
  });
  await client.connect();
  try {
    await client.query(script);
  } finally {
    await client.end();
  }
  if (!selfCheckPassed) {
    throw new Error('database-roles.sql ended without its self-check notice');
  }
}

/** A random role name for one suite (roles are server-wide). */
export function randomRoleName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Gives `role` a fresh password and returns the URL of `database` that logs
 * in as it (the script itself sets no password).
 */
export async function loginUrlOf(
  serverUrl: string,
  database: string,
  role: string,
): Promise<string> {
  const password = randomUUID();
  await admin(serverUrl, (client) =>
    client.query(
      `ALTER ROLE ${quoteIdentifier(role)} PASSWORD ${quoteLiteral(password)}`,
    ),
  );
  return urlAs(serverUrl, database, role, password);
}

/** The URL of `database` that logs in as `role`. */
export function urlAs(
  serverUrl: string,
  database: string,
  role: string,
  password: string,
): string {
  const url = new URL(withDatabase(serverUrl, database));
  url.username = role;
  url.password = password;
  return url.toString();
}

/**
 * Drops the suite's roles. Drop the database first: a role cannot be dropped
 * while it owns the database or has rights recorded in it.
 */
export async function dropRoles(
  serverUrl: string,
  roles: string[],
): Promise<void> {
  await admin(serverUrl, async (client) => {
    for (const role of roles) {
      await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    }
  });
}

/** Runs the content migrations (the real content:migrate path). */
export async function migrateContent(databaseUrl: string): Promise<void> {
  const db = createMigrationDb(databaseUrl);
  try {
    await runContentMigrations(db, DEFAULT_CONTENT_PATHS.migrationsDir);
  } finally {
    await db.destroy();
  }
}

/** The SQLSTATE a statement fails with as `databaseUrl`'s user, or null. */
export async function failureCodeOf(
  databaseUrl: string,
  statement: string,
): Promise<string | null> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(statement);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'no-code';
  } finally {
    await client.end();
  }
}

/** The SQLSTATE for a missing privilege (also `must be owner`). */
export const INSUFFICIENT_PRIVILEGE = '42501';

/** Statements the runtime API role must be refused (ADR 0012 section 5). */
export const DDL_REFUSED_FOR_API_ROLE: string[] = [
  'CREATE TABLE public.denied_probe (id int)',
  'CREATE TABLE content.denied_probe (id int)',
  'CREATE SCHEMA denied_probe',
  'CREATE FUNCTION public.denied_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
  'CREATE INDEX denied_probe ON public.app_settings (key)',
  'ALTER TABLE public.app_settings ADD COLUMN denied_probe int',
  'ALTER TABLE content.profile ADD COLUMN denied_probe int',
  'DROP TABLE public.app_settings',
  'DROP TABLE content.profile',
  'TRUNCATE public.app_settings',
  'TRUNCATE content.profile',
];

/** The migration history and content type tables, with a text column each. */
const META_TABLE_TEXT_COLUMNS: Record<string, string> = {
  'public._prisma_migrations': 'checksum',
  'content._migrations': 'name',
  'content._content_types': 'slug',
};

/** Writes to the meta tables, which only the migrator may do. */
export const META_TABLE_WRITES_REFUSED_FOR_API_ROLE: string[] = Object.entries(
  META_TABLE_TEXT_COLUMNS,
).flatMap(([table, column]) => [
  `INSERT INTO ${table} DEFAULT VALUES`,
  `UPDATE ${table} SET ${column} = 'x'`,
  `DELETE FROM ${table}`,
  `TRUNCATE ${table}`,
]);

/** Runs one statement as `databaseUrl`'s user and returns its rows. */
export async function rowsOf<T extends object>(
  databaseUrl: string,
  statement: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return (await client.query<T>(statement, values)).rows;
  } finally {
    await client.end();
  }
}

/** Every grant the script owns, as text, to compare two runs. */
export async function grantSnapshotOf(
  superuserUrl: string,
  database: string,
): Promise<Record<string, unknown[]>> {
  const [objects, databases, defaults] = await Promise.all([
    rowsOf(
      superuserUrl,
      `SELECT n.nspname || '.' || c.relname AS name, c.relacl::text AS acl
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'content') AND c.relkind IN ('r', 'p', 'S')
       ORDER BY 1`,
    ),
    rowsOf(
      superuserUrl,
      `SELECT d.datdba::regrole::text AS owner, d.datacl::text AS acl,
              (SELECT string_agg(n.nspname || '=' || coalesce(n.nspacl::text, ''), ';' ORDER BY n.nspname)
               FROM pg_namespace n WHERE n.nspname IN ('public', 'content')) AS schemas
       FROM pg_database d WHERE d.datname = $1`,
      [database],
    ),
    rowsOf(
      superuserUrl,
      `SELECT defaclrole::regrole::text AS owner, defaclnamespace::regnamespace::text AS schema,
              defaclobjtype AS kind, defaclacl::text AS acl
       FROM pg_default_acl ORDER BY 1, 2, 3`,
    ),
  ]);
  return { objects, databases, defaults };
}

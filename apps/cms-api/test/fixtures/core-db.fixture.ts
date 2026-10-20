import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Client } from 'pg';

const run = promisify(execFile);
const APP_ROOT = join(__dirname, '..', '..');
const PRISMA_BIN = join(APP_ROOT, 'node_modules', '.bin', 'prisma');

/** Runs `prisma migrate deploy` (the real db:migrate path) against `databaseUrl`. */
export async function migrateCore(databaseUrl: string): Promise<void> {
  await run(PRISMA_BIN, ['migrate', 'deploy'], {
    cwd: APP_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
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

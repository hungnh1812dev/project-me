import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

/** SPEC §3: integration tests run against Postgres 17. */
export const POSTGRES_TEST_IMAGE = 'postgres:17-alpine';

/**
 * Every Jest worker shares one server; each suite opens an app (Prisma and
 * Kysely pools) plus its own handles, so the default 100 is too few.
 */
const POSTGRES_TEST_MAX_CONNECTIONS = 500;

/** Set by the integration global setup to the shared server's admin URL. */
export const SHARED_POSTGRES_URL_ENV = 'CMS_API_TEST_POSTGRES_URL';

/** One test file's own database on the shared server. */
export interface TestPostgres {
  getConnectionUri(): string;
  /** Drops the database; the shared server stays up for the other files. */
  stop(): Promise<void>;
}

async function onServer(serverUrl: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/** Starts the one server the whole integration run shares (global setup). */
export function startSharedPostgres() {
  return new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
    .withCommand([
      'postgres',
      '-c',
      `max_connections=${POSTGRES_TEST_MAX_CONNECTIONS}`,
    ])
    .start();
}

/**
 * An empty database of its own on the shared server, so test files running
 * in parallel never see each other's tables.
 */
export async function startPostgres(): Promise<TestPostgres> {
  const serverUrl = process.env[SHARED_POSTGRES_URL_ENV];
  if (serverUrl === undefined) {
    throw new Error(
      `${SHARED_POSTGRES_URL_ENV} is not set; run integration tests through the jest "integration" project`,
    );
  }
  const database = `f_${randomUUID().replace(/-/g, '')}`;
  await onServer(serverUrl, `CREATE DATABASE "${database}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  const connectionUri = url.toString();
  return {
    getConnectionUri: () => connectionUri,
    stop: () => onServer(serverUrl, `DROP DATABASE "${database}" WITH (FORCE)`),
  };
}

/** A localhost URL on a port nothing listens on, to simulate a DB outage. */
export async function unreachableDatabaseUrl(): Promise<string> {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not reserve a port'));
        }
      });
    });
  });
  return `postgresql://nobody:nothing@127.0.0.1:${port}/none`;
}

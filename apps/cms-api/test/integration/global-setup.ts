import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import {
  SHARED_POSTGRES_URL_ENV,
  startSharedPostgres,
} from '../fixtures/postgres.fixture';

declare global {
  var sharedPostgres: StartedPostgreSqlContainer | undefined;
}

/** One Postgres for the whole run; workers inherit its URL through the env. */
export default async function globalSetup(): Promise<void> {
  globalThis.sharedPostgres = await startSharedPostgres();
  process.env[SHARED_POSTGRES_URL_ENV] =
    globalThis.sharedPostgres.getConnectionUri();
}

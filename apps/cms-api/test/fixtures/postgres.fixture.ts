import { createServer } from 'node:net';

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/** SPEC §3: integration tests run against Postgres 16. */
export const POSTGRES_TEST_IMAGE = 'postgres:16-alpine';

export function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_TEST_IMAGE).start();
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

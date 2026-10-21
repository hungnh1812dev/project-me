import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { dbEnvOf, devEnv } from '../fixtures/env.fixture';
import {
  startPostgres,
  unreachableDatabaseUrl,
} from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

describe('health (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;

  beforeAll(async () => {
    postgres = await startPostgres();
    app = await createTestApp(
      devEnv({ ...dbEnvOf(postgres.getConnectionUri()) }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  it('GET /api/v1/health/live → 200 { status: "ok" } only', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready → 200 when the DB answers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it.each(['/api/v1/health/live/', '/api/v1/health/ready/'])(
    'tolerates a trailing slash on %s (no redirect)',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).redirects(0);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    },
  );

  it('routes are only served under the /api/v1 prefix', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(404);
  });
});

describe('health with the database down', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(
      devEnv({ ...dbEnvOf(await unreachableDatabaseUrl()) }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('live stays 200 (process is up)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.status).toBe(200);
  });

  it('ready → 503 { status: "error" } with no internals', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { dbEnvOf, devEnv } from '../fixtures/Env.fixture';
import {
  startPostgres,
  unreachableDatabaseUrl,
  type TestPostgres,
} from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

describe('health (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;

  beforeAll(async () => {
    postgres = await startPostgres();
    app = await createTestApp(devEnv({ ...dbEnvOf(postgres.getConnectionUri()) }));
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  it.each(['/health', '/health/live'])('GET %s → 200 { status: "ok" } only', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready → 200 when the DB answers', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it.each(['/health', '/health/live', '/health/ready'])(
    'HEAD %s answers 200 with no body',
    async (path) => {
      const res = await request(app.getHttpServer()).head(path);
      expect(res.status).toBe(200);
      expect(res.text ?? '').toBe('');
    },
  );

  it.each(['/health', '/health/live', '/health/ready'])(
    'GET and HEAD %s carry Cache-Control: no-store',
    async (path) => {
      const get = await request(app.getHttpServer()).get(path);
      const head = await request(app.getHttpServer()).head(path);
      expect(get.headers['cache-control']).toBe('no-store');
      expect(head.headers['cache-control']).toBe('no-store');
    },
  );

  it('/health/other answers the standard 404', async () => {
    const res = await request(app.getHttpServer()).get('/health/other');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('errorCode');
  });

  it.each(['/health/', '/health/live/', '/health/ready/'])(
    'tolerates a trailing slash on %s (no redirect)',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).redirects(0);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    },
  );

  it.each(['/api/v1/health', '/api/v1/health/live', '/api/v1/health/ready'])(
    'the old path %s answers the standard 404',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).redirects(0);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('errorCode');
    },
  );
});

describe('health with the database down', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(devEnv({ ...dbEnvOf(await unreachableDatabaseUrl()) }));
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['/health', '/health/live'])('%s stays 200 (process is up)', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
  });

  it('ready → 503 { status: "error" } with no internals', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

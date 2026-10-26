import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { dbEnvOf, devEnv } from '../fixtures/Env.fixture';
import { unreachableDatabaseUrl } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('HTTP pipeline', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(await unreachableDatabaseUrl()),
        TRUST_PROXY_HOPS: '2',
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the unified error shape for an unknown route', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/does-not-exist',
    );
    expect(res.status).toBe(404);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'errorCode',
      'message',
      'requestId',
      'statusCode',
    ]);
    expect(res.body).toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' });
  });

  it('generates a request id and echoes it in the header and body', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    const header = res.headers['x-request-id'];
    expect(header).toMatch(UUID_PATTERN);
    expect((res.body as { requestId: string }).requestId).toBe(header);
  });

  it('keeps a well-formed inbound request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('X-Request-Id', 'trace-abc_123');
    expect(res.headers['x-request-id']).toBe('trace-abc_123');
  });

  it('replaces a malformed inbound request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('applies strict routing off and trust proxy = TRUST_PROXY_HOPS', () => {
    const express = app.getHttpAdapter().getInstance() as {
      get(setting: string): unknown;
    };
    expect(express.get('strict routing')).toBe(false);
    expect(express.get('trust proxy')).toBe(2);
  });
});

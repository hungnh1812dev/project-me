import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { APP_LOGGER } from '../../src/infrastructure/logging/AppLogger.port';
import { dbEnvOf, devEnv } from '../fixtures/Env.fixture';
import { unreachableDatabaseUrl } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist');
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

@Controller('timing-probe')
class TimingProbeController {
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [TimingProbeController] })
class TimingProbeModule {}

describe('HTTP pipeline request timing log', () => {
  let app: NestExpressApplication;
  const info = jest.fn();
  const warn = jest.fn();
  const linesOf = () => info.mock.calls.map(([line]) => line as string);

  beforeAll(async () => {
    app = await createTestApp(
      devEnv({ ...dbEnvOf(await unreachableDatabaseUrl()) }),
      [{ token: APP_LOGGER, value: { info, warn, error: jest.fn() } }],
      [TimingProbeModule],
    );
  });

  beforeEach(() => {
    info.mockClear();
    warn.mockClear();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['a 404', 'get', '/api/v1/does-not-exist', 404],
    ['a 401', 'get', '/api/v1/auth/me', 401],
  ] as const)('logs one line for %s', async (_label, method, path, status) => {
    await request(app.getHttpServer())[method](path);
    expect(linesOf()).toEqual([
      expect.stringMatching(new RegExp(`^GET ${path} ${status} \\d+ms$`)),
    ]);
  });

  it('logs one line for a 413 on the GraphQL body cap', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/graphql')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: 'x'.repeat(40_000) }));
    expect(res.status).toBe(413);
    expect(linesOf()).toEqual([expect.stringMatching(/^POST \/api\/v1\/graphql 413 \d+ms$/)]);
  });

  it('logs a 200 and never the query string', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/timing-probe?x=secret');
    expect(res.status).toBe(200);
    expect(linesOf()).toHaveLength(1);
    expect(linesOf()[0]).toMatch(/^GET \/api\/v1\/timing-probe 200 \d+ms$/);
    expect(linesOf()[0]).not.toContain('secret');
  });

  it('logs nothing for the health probes', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live');
    await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

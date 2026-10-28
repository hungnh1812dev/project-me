import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { API_CONTENT_SECURITY_POLICY } from '../../src/common/constants/Http.constants';
import { dbEnvOf, devEnv } from '../fixtures/Env.fixture';
import { unreachableDatabaseUrl } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const EXPECTED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/** SPEC D17: `default-src 'none'` and no `X-Powered-By` on every route. */
describe('security headers', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(devEnv(dbEnvOf(await unreachableDatabaseUrl())));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('hardens a normal route', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toMatchObject(EXPECTED_HEADERS);
  });

  it('hardens POST /graphql', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/graphql')
      .send({ query: '{ __typename }' });
    expect(res.headers['content-security-policy']).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toMatchObject(EXPECTED_HEADERS);
  });

  it('hardens a 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-security-policy']).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toMatchObject(EXPECTED_HEADERS);
  });

  it('hardens an oversized GraphQL body (413)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/graphql')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: 'a'.repeat(40 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.headers['content-security-policy']).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers).toMatchObject(EXPECTED_HEADERS);
  });
});

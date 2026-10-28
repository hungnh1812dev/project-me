import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { dbEnvOf, devEnv, TEST_ADMIN_ORIGIN } from '../fixtures/Env.fixture';
import { unreachableDatabaseUrl } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';

const LIVE_PATH = '/api/v1/health/live';
const OTHER_ORIGIN = 'https://evil.example.test';

/** SPEC §6 / D14: the admin origin is the only CORS origin, credentials on. */
describe('CORS', () => {
  describe('with ADMIN_ORIGIN set', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp(
        devEnv({
          ...dbEnvOf(await unreachableDatabaseUrl()),
          ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        }),
      );
    });

    afterAll(async () => {
      await app?.close();
    });

    it('answers the admin preflight with the exact origin and credentials', async () => {
      const res = await request(app.getHttpServer())
        .options(LIVE_PATH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(
        TEST_ADMIN_ORIGIN,
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toMatch(
        /Authorization/,
      );
      expect(res.headers['vary']).toMatch(/Origin/);
    });

    it('allows the actual admin request and exposes the request id and Retry-After', async () => {
      const res = await request(app.getHttpServer())
        .get(LIVE_PATH)
        .set('Origin', TEST_ADMIN_ORIGIN);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        TEST_ADMIN_ORIGIN,
      );
      expect(res.headers['access-control-expose-headers']).toMatch(
        /x-request-id/,
      );
      expect(res.headers['access-control-expose-headers']).toMatch(
        /Retry-After/,
      );
    });

    it('never allows another origin or a wildcard', async () => {
      const res = await request(app.getHttpServer())
        .get(LIVE_PATH)
        .set('Origin', OTHER_ORIGIN);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('without ADMIN_ORIGIN', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp(
        devEnv({ ...dbEnvOf(await unreachableDatabaseUrl()) }),
      );
    });

    afterAll(async () => {
      await app?.close();
    });

    it('sends no CORS headers', async () => {
      const res = await request(app.getHttpServer())
        .get(LIVE_PATH)
        .set('Origin', TEST_ADMIN_ORIGIN);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});

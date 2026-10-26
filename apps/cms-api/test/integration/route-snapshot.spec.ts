import type { NestExpressApplication } from '@nestjs/platform-express';

import { dbEnvOf, devEnv } from '../fixtures/env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function listRoutes(app: NestExpressApplication): string[] {
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    router: { stack: RouteLayer[] };
  };
  return instance.router.stack.flatMap(({ route }) =>
    route === undefined
      ? []
      : Object.keys(route.methods).map(
          (method) => `${method.toUpperCase()} ${route.path}`,
        ),
  );
}

const EXPECTED_ROUTES: string[] = [
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/auth/me',
  'GET /api/v1/setup/status',
  'POST /api/v1/setup/owner',
  'POST /api/v1/auth/password/request-otp',
  'POST /api/v1/auth/password/reset',
  'POST /api/v1/auth/password/set',
  'POST /api/v1/auth/password/change',
  'POST /api/v1/auth/2fa/totp/setup',
  'POST /api/v1/auth/2fa/enable',
  'POST /api/v1/auth/2fa/disable',
  'POST /api/v1/auth/2fa/email/send-code',
  'POST /api/v1/auth/2fa/verify',
  'POST /api/v1/auth/2fa/email-challenge',
  'GET /api/v1/accounts',
  'POST /api/v1/accounts',
  'PATCH /api/v1/accounts/:id',
  'POST /api/v1/accounts/:id/disable',
  'POST /api/v1/accounts/:id/enable',
  'POST /api/v1/accounts/:id/invite/resend',
  'POST /api/v1/accounts/:id/sessions/revoke',
  'GET /api/v1/api-tokens',
  'POST /api/v1/api-tokens',
  'PATCH /api/v1/api-tokens/:id',
  'POST /api/v1/api-tokens/:id/revoke',
  'GET /api/v1/roles',
  'POST /api/v1/roles',
  'PATCH /api/v1/roles/:id',
  'DELETE /api/v1/roles/:id',
  'PUT /api/v1/roles/:id/permissions',
  'GET /api/v1/content-types',
  'GET /api/v1/content-types/:slug',
  'POST /api/v1/documents/:slug/bulk/create',
  'POST /api/v1/documents/:slug/bulk/publish',
  'POST /api/v1/documents/:slug/bulk/unpublish',
  'POST /api/v1/documents/:slug/bulk/delete',
  'GET /api/v1/documents/:slug',
  'GET /api/v1/documents/:slug/:documentId',
  'POST /api/v1/documents/:slug',
  'PUT /api/v1/documents/:slug/:documentId',
  'POST /api/v1/documents/:slug/:documentId/publish',
  'POST /api/v1/documents/:slug/:documentId/unpublish',
  'DELETE /api/v1/documents/:slug/:documentId',
  'POST /api/v1/documents/:slug/:documentId/presence',
  'POST /api/v1/graphql',
  'POST /api/v1/media',
  'GET /api/v1/media',
  'PATCH /api/v1/media/:id',
  'DELETE /api/v1/media/:id',
  'GET /api/v1/reviewer/status',
  'POST /api/v1/reviewer/sessions',
  'GET /api/v1/reviewer/sessions',
  'PUT /api/v1/reviewer/settings',
];

describe('route snapshot (R2-10)', () => {
  let postgres: TestPostgres;
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

  it('serves exactly the recorded method + path pairs, in registration order', () => {
    expect(listRoutes(app)).toEqual(EXPECTED_ROUTES);
  });

  it('has no duplicate method + path pair', () => {
    const routes = listRoutes(app);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

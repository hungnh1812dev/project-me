import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '@/core/config/env';
import { server } from '@/test/msw/server';

import { ApiError } from './apiError';
import { cmsApi, configureCmsApi } from './CmsApi';

describe('cmsApi instance', () => {
  it('uses the API base URL, sends cookies and speaks JSON', () => {
    expect(cmsApi.defaults.baseURL).toBe(API_BASE_URL);
    expect(cmsApi.defaults.withCredentials).toBe(true);
    expect(cmsApi.defaults.headers['Content-Type']).toBe('application/json');
    expect(cmsApi.defaults.headers.Accept).toBe('application/json');
  });
});

// Runs before any test calls configureCmsApi, so the built-in no-op handlers are in place.
describe('before configureCmsApi is called', () => {
  it('sends no bearer and still refreshes and retries a 401', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'fresh-token' }),
      ),
      http.get('*/api/v1/guarded', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh-token'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const res = await cmsApi.get<{ ok: boolean }>('/guarded');

    expect(res.data).toEqual({ ok: true });
  });

  it('rejects with 401 when the default refresh handler finds no session', async () => {
    server.use(
      http.get('*/api/v1/guarded', () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    await expect(cmsApi.get('/guarded')).rejects.toMatchObject({ status: 401 });
  });
});

describe('bearer interceptor', () => {
  let token: string | null;

  beforeEach(() => {
    token = null;
    configureCmsApi({
      getAccessToken: () => token,
      onTokenRefreshed: () => {},
      onSessionExpired: () => {},
    });
  });

  function echoAuthorization() {
    server.use(
      http.get('*/api/v1/echo', ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') }),
      ),
    );
  }

  it('adds Authorization: Bearer <token> when a token is held', async () => {
    echoAuthorization();
    token = 'abc.def.ghi';

    const res = await cmsApi.get<{ authorization: string | null }>('/echo');

    expect(res.data.authorization).toBe('Bearer abc.def.ghi');
  });

  it('omits the Authorization header when no token is held', async () => {
    echoAuthorization();

    const res = await cmsApi.get<{ authorization: string | null }>('/echo');

    expect(res.data.authorization).toBeNull();
  });

  it('rejects non-401 failures with a normalized ApiError', async () => {
    server.use(
      http.get('*/api/v1/broken', () =>
        HttpResponse.json(
          { statusCode: 400, message: ['a is required', 'b is required'], error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    );

    const error = await cmsApi.get('/broken').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'a is required, b is required' });
  });

  it('rejects a network failure with an ApiError of status 0', async () => {
    server.use(http.get('*/api/v1/offline', () => HttpResponse.error()));

    const error = await cmsApi.get('/offline').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });
});

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('bearer origin rule (SEC-3)', () => {
  const OTHER = 'https://other.example.test';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function echoAuthorizationOn(url: string) {
    server.use(
      http.get(url, ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') }),
      ),
    );
  }

  describe('with the relative /api/v1 base', () => {
    beforeEach(() => {
      configureCmsApi({
        getAccessToken: () => 'abc.def.ghi',
        onTokenRefreshed: () => {},
        onSessionExpired: () => {},
      });
    });

    it('sends the bearer to the API on the page origin', async () => {
      echoAuthorizationOn(`${window.location.origin}/api/v1/echo`);

      const res = await cmsApi.get<{ authorization: string | null }>('/echo');

      expect(res.data.authorization).toBe('Bearer abc.def.ghi');
    });

    it('sends the bearer to an absolute URL on the API origin', async () => {
      echoAuthorizationOn(`${window.location.origin}/api/v1/echo`);

      const res = await cmsApi.get<{ authorization: string | null }>(
        `${window.location.origin}/api/v1/echo`,
      );

      expect(res.data.authorization).toBe('Bearer abc.def.ghi');
    });

    it('does not send the bearer to an absolute URL on another origin', async () => {
      echoAuthorizationOn(`${OTHER}/echo`);

      const res = await cmsApi.get<{ authorization: string | null }>(`${OTHER}/echo`);

      expect(res.data.authorization).toBeNull();
    });

    it('does not send the bearer to a protocol-relative URL on another origin', async () => {
      // Node cannot fetch a protocol-relative URL, so capture the outgoing headers in the adapter.
      const res = await cmsApi.get<{ authorization: unknown }>('//other.example.test/echo', {
        adapter: (config) =>
          Promise.resolve({
            data: { authorization: config.headers.get('Authorization') ?? null },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          }),
      });

      expect(res.data.authorization).toBeNull();
    });

    it('does not refresh or retry a 401 from another origin', async () => {
      const refresh = { count: 0 };
      const onSessionExpired = vi.fn();
      configureCmsApi({
        getAccessToken: () => 'abc.def.ghi',
        onTokenRefreshed: () => {},
        onSessionExpired,
      });
      const seen: (string | null)[] = [];
      server.use(
        http.post('*/api/v1/auth/refresh', () => {
          refresh.count += 1;
          return HttpResponse.json({ message: 'ok', accessToken: 'fresh-token' });
        }),
        http.get(`${OTHER}/guarded`, ({ request }) => {
          seen.push(request.headers.get('Authorization'));
          return HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });
        }),
      );

      await expect(cmsApi.get(`${OTHER}/guarded`)).rejects.toMatchObject({ status: 401 });

      expect(refresh.count).toBe(0);
      expect(seen).toEqual([null]);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });

  describe('with an absolute VITE_API_URL base', () => {
    const API = 'https://api.example.test';

    async function loadCmsApi() {
      vi.stubEnv('VITE_API_URL', API);
      vi.resetModules();
      const mod = await import('./CmsApi');
      mod.configureCmsApi({
        getAccessToken: () => 'abc.def.ghi',
        onTokenRefreshed: () => {},
        onSessionExpired: () => {},
      });
      return mod.cmsApi;
    }

    it('sends the bearer to the absolute API base', async () => {
      const api = await loadCmsApi();
      echoAuthorizationOn(`${API}/api/v1/echo`);

      const res = await api.get<{ authorization: string | null }>('/echo');

      expect(res.data.authorization).toBe('Bearer abc.def.ghi');
    });

    it('does not send the bearer to the page origin when the API lives elsewhere', async () => {
      const api = await loadCmsApi();
      echoAuthorizationOn(`${window.location.origin}/echo`);

      const res = await api.get<{ authorization: string | null }>(`${window.location.origin}/echo`);

      expect(res.data.authorization).toBeNull();
    });

    it('does not send the bearer to another origin', async () => {
      const api = await loadCmsApi();
      echoAuthorizationOn(`${OTHER}/echo`);

      const res = await api.get<{ authorization: string | null }>(`${OTHER}/echo`);

      expect(res.data.authorization).toBeNull();
    });

    it('retries on the API origin with the refreshed bearer', async () => {
      const api = await loadCmsApi();
      server.use(
        http.post(`${API}/api/v1/auth/refresh`, () =>
          HttpResponse.json({ message: 'ok', accessToken: 'fresh-token' }),
        ),
        http.get(`${API}/api/v1/guarded`, ({ request }) =>
          request.headers.get('Authorization') === 'Bearer fresh-token'
            ? HttpResponse.json({ ok: true })
            : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
        ),
      );

      const res = await api.get<{ ok: boolean }>('/guarded');

      expect(res.data).toEqual({ ok: true });
    });
  });
});

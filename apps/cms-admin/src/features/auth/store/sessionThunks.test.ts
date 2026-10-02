import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeQueryClient } from '@/app/queryClient';
import { makeStore } from '@/app/store';
import { authApi } from '@/core/api/AuthApi';
import { cmsApi } from '@/core/api/CmsApi';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';

import {
  BOOTSTRAP_RETRY_DELAYS_MS,
  bootstrapSession,
  login,
  loginErrorMessage,
  logout,
  resetBootstrapLatch,
  retryBootstrap,
} from './sessionThunks';

const nest = (status: number, message: string) =>
  HttpResponse.json({ statusCode: status, message, error: 'Error' }, { status });

/** Refresh answers with `responses` in order (the last one repeats) and counts its calls. */
function refreshReturns(...responses: (() => Response)[]) {
  const calls = { count: 0 };
  server.use(
    http.post('*/api/v1/auth/refresh', () => {
      const respond = responses[Math.min(calls.count, responses.length - 1)];
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

const refreshOk =
  (token = 'fresh') =>
  () =>
    HttpResponse.json({ message: 'Token refreshed', accessToken: token });

/** `GET /auth/me` answers with `responses` in order and records the bearer it saw. */
function meReturns(...responses: (() => Response)[]) {
  const seen: (string | null)[] = [];
  server.use(
    http.get('*/api/v1/auth/me', ({ request }) => {
      const respond = responses[Math.min(seen.length, responses.length - 1)];
      seen.push(request.headers.get('Authorization'));
      return respond();
    }),
  );
  return seen;
}

const user = makeMeUser();
const meOk = () => HttpResponse.json(user);

beforeEach(() => {
  resetBootstrapLatch();
});

describe('bootstrapSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes, stores the token, then loads me with it and ends authenticated', async () => {
    const refresh = refreshReturns(refreshOk('fresh'));
    const seen = meReturns(meOk);
    const store = makeStore();

    const run = store.dispatch(bootstrapSession());
    expect(store.getState().auth.status).toBe('loading');
    await run;

    expect(refresh.count).toBe(1);
    expect(seen).toEqual(['Bearer fresh']);
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      accessToken: 'fresh',
      user,
      error: null,
    });
  });

  it('ends unauthenticated with no error when the refresh returns 401', async () => {
    refreshReturns(() => nest(401, 'Unauthorized'));
    const seen = meReturns(meOk);
    const store = makeStore();

    await store.dispatch(bootstrapSession());

    expect(seen).toEqual([]);
    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', error: null });
  });

  it('ends unauthenticated and drops the token when me returns 401', async () => {
    const refresh = refreshReturns(refreshOk());
    meReturns(() => nest(401, 'Unauthorized'));
    const store = makeStore();

    await store.dispatch(bootstrapSession());

    expect(refresh.count).toBe(1);
    expect(store.getState().auth).toEqual({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      error: null,
    });
  });

  it('retries a 500 after 2000, 5000 and 10000 ms, then ends in error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const refresh = refreshReturns(() => nest(500, 'Internal server error'));
    const store = makeStore();

    const run = store.dispatch(bootstrapSession());
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh.count).toBe(1);

    let elapsed = 0;
    for (const [i, delay] of BOOTSTRAP_RETRY_DELAYS_MS.entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(refresh.count).toBe(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(refresh.count).toBe(i + 2);
      elapsed += delay;
    }
    await run;

    expect(BOOTSTRAP_RETRY_DELAYS_MS).toEqual([2000, 5000, 10000]);
    expect(elapsed).toBe(17000);
    expect(refresh.count).toBe(4);
    expect(store.getState().auth).toMatchObject({
      status: 'error',
      error: 'Internal server error',
    });
  });

  it('recovers when a network error or 429 is followed by success', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const refresh = refreshReturns(
      () => HttpResponse.error(),
      () => nest(429, 'Too many requests'),
      refreshOk(),
    );
    meReturns(meOk);
    const store = makeStore();

    const run = store.dispatch(bootstrapSession());
    await vi.advanceTimersByTimeAsync(2000 + 5000);
    await run;

    expect(refresh.count).toBe(3);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('keeps the token from a successful refresh and retries only me', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const refresh = refreshReturns(refreshOk('fresh'));
    const seen = meReturns(() => nest(503, 'Unavailable'), meOk);
    const store = makeStore();

    const run = store.dispatch(bootstrapSession());
    await vi.advanceTimersByTimeAsync(2000);
    await run;

    expect(refresh.count).toBe(1);
    expect(seen).toEqual(['Bearer fresh', 'Bearer fresh']);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('ends in error at once for a status that retrying will not fix', async () => {
    refreshReturns(refreshOk());
    const seen = meReturns(() => nest(404, 'Role not found'));
    const store = makeStore();

    await store.dispatch(bootstrapSession());

    expect(seen).toHaveLength(1);
    expect(store.getState().auth).toMatchObject({ status: 'error', error: 'Role not found' });
  });

  it('runs once per page load: a second dispatch reuses the first run', async () => {
    const refresh = refreshReturns(refreshOk());
    meReturns(meOk);
    const store = makeStore();

    const first = store.dispatch(bootstrapSession());
    const second = store.dispatch(bootstrapSession());
    await Promise.all([first, second]);
    await store.dispatch(bootstrapSession());

    expect(second).toBe(first);
    expect(refresh.count).toBe(1);
  });

  it('retryBootstrap runs the flow again after an error', async () => {
    refreshReturns(refreshOk());
    meReturns(() => nest(404, 'Role not found'), meOk);
    const store = makeStore();
    await store.dispatch(bootstrapSession());
    expect(store.getState().auth.status).toBe('error');

    await store.dispatch(retryBootstrap());

    expect(store.getState().auth).toMatchObject({ status: 'authenticated', error: null });
  });

  it('retryBootstrap joins a run that is still in flight', async () => {
    const refresh = refreshReturns(refreshOk());
    meReturns(meOk);
    const store = makeStore();

    const first = store.dispatch(bootstrapSession());
    const retry = store.dispatch(retryBootstrap());
    await first;

    expect(retry).toBe(first);
    expect(refresh.count).toBe(1);
  });
});

describe('login', () => {
  const credentials = { email: 'jane@example.com', password: 'secret', rememberMe: true };

  it('stores the token, then loads me with it and ends authenticated', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'Login successful', accessToken: 'login-token' });
      }),
    );
    const seen = meReturns(meOk);
    const store = makeStore();

    const result = await store.dispatch(login(credentials));

    expect(result).toEqual({ ok: true });
    expect(body).toEqual(credentials);
    expect(seen).toEqual(['Bearer login-token']);
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      accessToken: 'login-token',
      user,
      error: null,
    });
  });

  it('does not keep the access token in the RTK Query cache', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'login-token' }),
      ),
    );
    meReturns(meOk);
    const store = makeStore();

    await store.dispatch(login(credentials));

    expect(JSON.stringify(store.getState().authApi)).not.toContain('login-token');
  });

  it.each([
    [401, 'Invalid credentials', 'Invalid email or password.'],
    [403, 'Email not verified', "Your email address isn't verified yet."],
    [429, 'ThrottlerException', 'Too many attempts. Please try again later.'],
    [500, 'Database is down', 'Database is down'],
  ])('maps a %i from login to "%s" → %s', async (status, serverMessage, expected) => {
    server.use(http.post('*/api/v1/auth/login', () => nest(status, serverMessage)));
    const store = makeStore();

    const result = await store.dispatch(login(credentials));

    expect(result).toEqual({ ok: false, message: expected });
    expect(store.getState().auth).toMatchObject({
      status: 'unauthenticated',
      accessToken: null,
      error: expected,
    });
  });

  it('clears the token when me fails after a successful login', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'login-token' }),
      ),
    );
    meReturns(() => nest(500, 'Server error'));
    const store = makeStore();

    const result = await store.dispatch(login(credentials));

    expect(result).toEqual({ ok: false, message: 'Server error' });
    expect(store.getState().auth).toMatchObject({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      error: 'Server error',
    });
  });

  it('loginErrorMessage maps a network failure to the normalized message', () => {
    expect(loginErrorMessage({ status: 0, message: 'Cannot reach the server.' })).toBe(
      'Cannot reach the server.',
    );
  });
});

describe('logout', () => {
  function signedInStore() {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(['content-types'], [{ uid: 'article' }]);
    const store = makeStore({
      queryClient,
      preloadedAuth: { status: 'authenticated', accessToken: 'tok', user },
    });
    return { store, queryClient };
  }

  it('clears local state and caches before calling POST /auth/logout', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: true })));
    const { store, queryClient } = signedInStore();
    await store.dispatch(authApi.endpoints.hasUsers.initiate());
    let atRequest: unknown;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        atRequest = {
          auth: store.getState().auth,
          queries: store.getState().authApi.queries,
          cached: queryClient.getQueryData(['content-types']),
        };
        return HttpResponse.json({ message: 'Logged out' });
      }),
    );

    await store.dispatch(logout());

    expect(atRequest).toEqual({
      auth: { status: 'unauthenticated', accessToken: null, user: null, error: null },
      queries: {},
      cached: undefined,
    });
    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(store.getState().authApi.mutations).toEqual({});
  });

  it('ignores a failing logout call', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => nest(500, 'boom')));
    const { store } = signedInStore();

    await expect(store.dispatch(logout())).resolves.toBeUndefined();

    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', error: null });
  });
});

describe('web storage (AC-12)', () => {
  it('is never written during bootstrap, login, refresh, expiry and logout', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    refreshReturns(refreshOk('boot'), refreshOk('rotated'), () => nest(401, 'Unauthorized'));
    meReturns(meOk);
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'login-token' }),
      ),
      http.get('*/api/v1/items', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer rotated'
          ? HttpResponse.json([])
          : nest(401, 'Unauthorized'),
      ),
      http.get('*/api/v1/other', () => nest(401, 'Unauthorized')),
    );
    const store = makeStore();

    await store.dispatch(bootstrapSession());
    await store.dispatch(login({ email: 'a@b.c', password: 'pw' }));
    await cmsApi.get('/items');
    await expect(cmsApi.get('/other')).rejects.toMatchObject({ status: 401 });
    await store.dispatch(logout());

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

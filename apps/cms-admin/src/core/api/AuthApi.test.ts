import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeStore } from '@/app/store';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';

import { authApi } from './AuthApi';

describe('authApi', () => {
  it('hasUsers reads GET /auth/has-users', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: false })));
    const store = makeStore();

    const result = await store.dispatch(authApi.endpoints.hasUsers.initiate());

    expect(result.data).toEqual({ hasUsers: false });
  });

  it('login posts the credentials and returns the token without a refresh on 401', async () => {
    let body: unknown;
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'ok', accessToken: 'tok' });
      }),
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'x' });
      }),
    );
    const store = makeStore();
    const credentials = { email: 'a@b.c', password: 'secret', rememberMe: true };

    const ok = await store.dispatch(authApi.endpoints.login.initiate(credentials)).unwrap();

    expect(ok).toEqual({ message: 'ok', accessToken: 'tok' });
    expect(body).toEqual(credentials);

    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );
    const failed = await store.dispatch(authApi.endpoints.login.initiate(credentials));
    expect(failed).toMatchObject({ error: { status: 401, message: 'Invalid credentials' } });
    expect(refreshes).toBe(0);
  });

  it('me reads GET /auth/me with the bearer', async () => {
    const user = makeMeUser();
    let auth: string | null = null;
    server.use(
      http.get('*/api/v1/auth/me', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json(user);
      }),
    );
    const store = makeStore({ preloadedAuth: { accessToken: 'tok' } });

    const result = await store.dispatch(authApi.endpoints.me.initiate());

    expect(result.data).toEqual(user);
    expect(auth).toBe('Bearer tok');
  });

  it('logout posts to /auth/logout', async () => {
    let called = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        called = true;
        return HttpResponse.json({ message: 'Logged out' });
      }),
    );
    const store = makeStore();

    const result = await store.dispatch(authApi.endpoints.logout.initiate()).unwrap();

    expect(result).toEqual({ message: 'Logged out' });
    expect(called).toBe(true);
  });
});

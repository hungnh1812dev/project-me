import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { authApi } from '@/core/api/AuthApi';
import { cmsApi, refreshAccessToken } from '@/core/api/CmsApi';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';

import { makeQueryClient } from './queryClient';
import { store as appStore, makeStore } from './store';

const unauthorized = () =>
  HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });

describe('makeStore', () => {
  it('creates the auth slice and the authApi state', () => {
    const store = makeStore();

    expect(store.getState().auth).toEqual({
      status: 'idle',
      accessToken: null,
      user: null,
      error: null,
    });
    expect(store.getState()[authApi.reducerPath]).toBeDefined();
  });

  it('merges a preloaded auth state over the initial state', () => {
    const user = makeMeUser();
    const store = makeStore({ preloadedAuth: { status: 'authenticated', user } });

    expect(store.getState().auth).toMatchObject({ status: 'authenticated', user, error: null });
  });

  it('sends the access token held in the store as the bearer', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/ping', ({ request }) => {
        seen.push(request.headers.get('Authorization'));
        return HttpResponse.json({});
      }),
    );
    makeStore({ preloadedAuth: { accessToken: 'store-token' } });

    await cmsApi.get('/ping');

    expect(seen).toEqual(['Bearer store-token']);
  });

  it('stores a refreshed token in the auth slice', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'rotated' }),
      ),
    );
    const store = makeStore();

    await refreshAccessToken();

    expect(store.getState().auth.accessToken).toBe('rotated');
  });

  it('on session expiry clears the session, the RTK Query state and the React Query cache', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(['content-types'], [{ uid: 'article' }]);
    server.use(
      http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: true })),
      http.get('*/api/v1/content-types', unauthorized),
    );
    const store = makeStore({
      queryClient,
      preloadedAuth: { status: 'authenticated', accessToken: 'old', user: makeMeUser() },
    });
    await store.dispatch(authApi.endpoints.hasUsers.initiate());
    expect(Object.keys(store.getState().authApi.queries)).toHaveLength(1);

    await expect(cmsApi.get('/content-types')).rejects.toMatchObject({ status: 401 });

    expect(store.getState().auth).toEqual({
      status: 'unauthenticated',
      accessToken: null,
      user: null,
      error: null,
    });
    expect(store.getState().authApi.queries).toEqual({});
    expect(queryClient.getQueryData(['content-types'])).toBeUndefined();
  });

  it('exports an app store instance', () => {
    expect(appStore.getState().auth.status).toBe('idle');
  });
});

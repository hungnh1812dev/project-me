import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { userLoaded } from '../store/AuthSlice';
import { resetBootstrapLatch } from '../store/sessionThunks';
import { useAuth } from './useAuth';

beforeEach(() => {
  resetBootstrapLatch();
});

describe('useAuth', () => {
  it('exposes the session state and the session actions', () => {
    const role = makeRole({ permissions: ['user:read'] });
    const user = makeMeUser({ role });

    const { result } = renderHookWithProviders(() => useAuth(), {
      auth: { status: 'authenticated', accessToken: 'tok', user },
    });

    expect(result.current).toMatchObject({
      status: 'authenticated',
      user,
      role,
      permissions: ['user:read'],
    });
    expect(result.current.login).toBeTypeOf('function');
    expect(result.current.logout).toBeTypeOf('function');
    expect(result.current.retryBootstrap).toBeTypeOf('function');
  });

  it('returns a null role and empty permissions when signed out', () => {
    const { result } = renderHookWithProviders(() => useAuth());

    expect(result.current).toMatchObject({ status: 'idle', user: null, role: null });
    expect(result.current.permissions).toEqual([]);
  });

  it('re-renders with the new permissions when the user changes', () => {
    const { result, store } = renderHookWithProviders(() => useAuth(), {
      auth: { status: 'authenticated', user: makeMeUser() },
    });

    act(() => {
      store.dispatch(userLoaded(makeMeUser({ role: makeRole({ permissions: ['media:read'] }) })));
    });

    expect(result.current.permissions).toEqual(['media:read']);
  });

  it('login signs in and resolves with the result', async () => {
    const user = makeMeUser();
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'tok' }),
      ),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
    );
    const { result } = renderHookWithProviders(() => useAuth());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.login({ email: 'jane@example.com', password: 'pw' });
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current).toMatchObject({ status: 'authenticated', user });
  });

  it('logout signs out', async () => {
    const { result } = renderHookWithProviders(() => useAuth(), {
      auth: { status: 'authenticated', accessToken: 'tok', user: makeMeUser() },
    });

    await act(() => result.current.logout());

    expect(result.current).toMatchObject({ status: 'unauthenticated', user: null });
  });

  it('retryBootstrap runs the bootstrap again', async () => {
    const user = makeMeUser();
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'tok' }),
      ),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
    );
    const { result } = renderHookWithProviders(() => useAuth(), {
      auth: { status: 'error', error: 'Down' },
    });

    await act(() => result.current.retryBootstrap());

    expect(result.current).toMatchObject({ status: 'authenticated', user });
  });
});

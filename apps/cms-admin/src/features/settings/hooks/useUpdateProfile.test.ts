import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { CURRENT_USER_QUERY_KEY } from '@/features/auth/hooks/useCurrentUserQuery';
import { makeMeUser, makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { settingsErrorReply, updateUserHandler } from '@/test/msw/settingsHandlers';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import { useUpdateProfile } from './useUpdateProfile';

const ME = makeMeUser({
  documentId: 'me-1',
  name: 'Jane Doe',
  role: makeRole({ permissions: [], level: 0 }),
});
const SIGNED_IN = { auth: { status: 'authenticated' as const, user: ME } };
const STALE_USERS = [makeUser({ documentId: 'stale' })];

describe('useUpdateProfile (U2, AC-11, AC-40)', () => {
  it('sends U2 to the signed-in user with exactly { name }, even without user permissions', async () => {
    const u2 = updateUserHandler();
    server.use(u2.handler);
    const { result } = renderHookWithProviders(() => useUpdateProfile(), SIGNED_IN);

    await act(() => result.current.mutateAsync({ name: 'Jane Roe' }));

    expect(u2.requests).toHaveLength(1);
    expect(u2.requests[0]?.url.pathname).toBe('/api/v1/users/me-1');
    expect(u2.requests[0]?.body).toEqual({ name: 'Jane Roe' });
  });

  it('writes the name to auth/me and the session, and invalidates users', async () => {
    server.use(updateUserHandler().handler);
    const { result, store, queryClient } = renderHookWithProviders(
      () => useUpdateProfile(),
      SIGNED_IN,
    );
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, ME);
    queryClient.setQueryData(settingsKeys.users(), STALE_USERS);

    await act(() => result.current.mutateAsync({ name: 'Jane Roe' }));

    expect(store.getState().auth.user).toEqual({ ...ME, name: 'Jane Roe' });
    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toEqual({ ...ME, name: 'Jane Roe' });
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(true);
  });

  it('prefers the fresher auth/me data over the session user when merging', async () => {
    server.use(updateUserHandler().handler);
    const fresh = { ...ME, verified: false };
    const { result, store, queryClient } = renderHookWithProviders(
      () => useUpdateProfile(),
      SIGNED_IN,
    );
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, fresh);

    await act(() => result.current.mutateAsync({ name: 'Jane Roe' }));

    expect(store.getState().auth.user).toEqual({ ...fresh, name: 'Jane Roe' });
  });

  it('leaves the session and cache unchanged on a server error', async () => {
    server.use(updateUserHandler(settingsErrorReply(400, 'Name is too long')).handler);
    const { result, store, queryClient } = renderHookWithProviders(
      () => useUpdateProfile(),
      SIGNED_IN,
    );
    queryClient.setQueryData(settingsKeys.users(), STALE_USERS);

    const error = await result.current.mutateAsync({ name: 'x' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Name is too long' });
    expect(store.getState().auth.user).toEqual(ME);
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(false);
  });

  it('rejects before any request when nobody is signed in', async () => {
    const u2 = updateUserHandler();
    server.use(u2.handler);
    const { result } = renderHookWithProviders(() => useUpdateProfile());

    const error = await result.current.mutateAsync({ name: 'Jane Roe' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(u2.requests).toHaveLength(0);
  });
});

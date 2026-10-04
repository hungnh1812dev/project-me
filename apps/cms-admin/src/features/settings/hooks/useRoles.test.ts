import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { CURRENT_USER_QUERY_KEY } from '@/features/auth/hooks/useCurrentUserQuery';
import { makeMeUser, makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createRoleHandler,
  deleteRoleHandler,
  settingsErrorReply,
  updateRoleHandler,
} from '@/test/msw/settingsHandlers';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import { useCreateRole, useDeleteRole, useUpdateRole } from './useRoles';

function signedIn(permissions: string[], roleId = 'role-super') {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({
        roleId,
        role: makeRole({ documentId: roleId, permissions, level: 100 }),
      }),
    },
  };
}

const MANAGER = signedIn(['role:read', 'role:manager']);
const READER = signedIn(['role:read']);
const STALE_ROLES = [makeRole({ documentId: 'stale' })];
const STALE_USERS = [makeUser({ documentId: 'stale' })];
const DENIED = 'Requires the "role:manager" permission.';

/** `GET /auth/me` answering with `user`, counting its calls. */
function meHandler(user = makeMeUser()) {
  const calls: number[] = [];
  return {
    calls,
    handler: http.get('*/api/v1/auth/me', () => {
      calls.push(1);
      return HttpResponse.json(user);
    }),
  };
}

describe('useCreateRole (R2, AC-6, AC-11)', () => {
  const INPUT = { name: 'Writer', slug: 'writer', permissions: ['document:read'], level: 10 };

  it('sends R2 and invalidates roles', async () => {
    const r2 = createRoleHandler();
    server.use(r2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);

    await act(() => result.current.mutateAsync(INPUT));

    expect(r2.requests[0]?.body).toEqual(INPUT);
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without role:manager', async () => {
    const r2 = createRoleHandler();
    server.use(r2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateRole(), READER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);

    const error = await result.current.mutateAsync(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: DENIED });
    expect(r2.requests).toHaveLength(0);
    expect(queryClient.getQueryData(settingsKeys.roles())).toBe(STALE_ROLES);
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(false);
  });

  it('leaves the cache unchanged on a server 409', async () => {
    server.use(createRoleHandler(settingsErrorReply(409, 'Slug exists')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({ status: 409 });
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(false);
  });
});

describe('useUpdateRole (R3, AC-6, AC-11, AC-20, AC-22)', () => {
  const OTHER = { documentId: 'role-editor', isDefault: false };

  it('sends R3 with only the changes and invalidates roles and users', async () => {
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useUpdateRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);
    queryClient.setQueryData(settingsKeys.users(), STALE_USERS);

    await act(() => result.current.mutateAsync({ role: OTHER, changes: { level: 30 } }));

    expect(r3.requests[0]?.body).toEqual({ level: 30 });
    expect(r3.requests[0]?.params.id).toBe('role-editor');
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(true);
  });

  it('does not refetch /auth/me for a role that is not the actor’s', async () => {
    const me = meHandler();
    server.use(updateRoleHandler().handler, me.handler);
    const { result } = renderHookWithProviders(() => useUpdateRole(), MANAGER);

    await act(() => result.current.mutateAsync({ role: OTHER, changes: { level: 30 } }));

    expect(me.calls).toHaveLength(0);
  });

  it('refetches /auth/me and dispatches userLoaded after editing the actor’s own role', async () => {
    const fresh = makeMeUser({
      roleId: 'role-super',
      role: makeRole({ documentId: 'role-super', permissions: ['role:read'], level: 100 }),
    });
    const me = meHandler(fresh);
    server.use(updateRoleHandler().handler, me.handler);
    const { result, store, queryClient } = renderHookWithProviders(() => useUpdateRole(), MANAGER);
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, makeMeUser());

    await act(() =>
      result.current.mutateAsync({
        role: { documentId: 'role-super', isDefault: false },
        changes: { permissions: ['role:read'] },
      }),
    );

    expect(me.calls).toHaveLength(1);
    expect(store.getState().auth.user).toEqual(fresh);
    expect(queryClient.getQueryState(CURRENT_USER_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  it('still resolves when the /auth/me refetch fails, keeping the old user', async () => {
    server.use(
      updateRoleHandler().handler,
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ message: 'Down' }, { status: 503 })),
    );
    const { result, store } = renderHookWithProviders(() => useUpdateRole(), MANAGER);
    const before = store.getState().auth.user;

    await act(() =>
      result.current.mutateAsync({
        role: { documentId: 'role-super', isDefault: false },
        changes: { level: 99 },
      }),
    );

    expect(store.getState().auth.user).toBe(before);
  });

  it('rejects before any request without role:manager', async () => {
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useUpdateRole(), READER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);

    const error = await result.current
      .mutateAsync({ role: OTHER, changes: { level: 1 } })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: DENIED });
    expect(r3.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(false);
  });

  it('rejects a name or level change on a default role before any request', async () => {
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { result } = renderHookWithProviders(() => useUpdateRole(), MANAGER);

    const error = await result.current
      .mutateAsync({ role: { documentId: 'role-admin', isDefault: true }, changes: { level: 1 } })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 403,
      message: 'The name and level of a default role cannot be changed.',
    });
    expect(r3.requests).toHaveLength(0);
  });

  it('allows a permissions change on a default role', async () => {
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { result } = renderHookWithProviders(() => useUpdateRole(), MANAGER);

    await act(() =>
      result.current.mutateAsync({
        role: { documentId: 'role-admin', isDefault: true },
        changes: { permissions: [] },
      }),
    );

    expect(r3.requests[0]?.body).toEqual({ permissions: [] });
  });
});

describe('useDeleteRole (R4, AC-6, AC-11, AC-21)', () => {
  const ROLE = { documentId: 'role-writer', isDefault: false };

  it('sends R4 and invalidates roles and users', async () => {
    const r4 = deleteRoleHandler();
    server.use(r4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);
    queryClient.setQueryData(settingsKeys.users(), STALE_USERS);

    await act(() => result.current.mutateAsync(ROLE));

    expect(r4.requests[0]?.params.id).toBe('role-writer');
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(true);
  });

  it('rejects a default role before any request', async () => {
    const r4 = deleteRoleHandler();
    server.use(r4.handler);
    const { result } = renderHookWithProviders(() => useDeleteRole(), MANAGER);

    const error = await result.current
      .mutateAsync({ documentId: 'role-admin', isDefault: true })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 403, message: 'A default role cannot be deleted.' });
    expect(r4.requests).toHaveLength(0);
  });

  it('leaves the cache unchanged on a server 409', async () => {
    server.use(deleteRoleHandler(settingsErrorReply(409, 'Role in use')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.roles(), STALE_ROLES);

    await expect(result.current.mutateAsync(ROLE)).rejects.toMatchObject({ status: 409 });
    expect(queryClient.getQueryData(settingsKeys.roles())).toBe(STALE_ROLES);
    expect(queryClient.getQueryState(settingsKeys.roles())?.isInvalidated).toBe(false);
  });
});

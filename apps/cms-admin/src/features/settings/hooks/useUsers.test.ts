import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeMeUser, makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  deleteUserHandler,
  listRolesHandler,
  listUsersHandler,
  settingsErrorReply,
  updateUserRoleHandler,
} from '@/test/msw/settingsHandlers';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import { useRoles } from './useRoles';
import { useAssignRole, useDeleteUser, useUsers } from './useUsers';

function signedIn(permissions: string[], level = 100) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ documentId: 'me', role: makeRole({ permissions, level }) }),
    },
  };
}

const MANAGER = signedIn(['user:read', 'user:manager', 'user:role_manager', 'role:read']);
const STALE = [makeUser({ documentId: 'stale' })];

describe('useUsers (U1)', () => {
  it('loads the users under settingsKeys.users()', async () => {
    const u1 = listUsersHandler();
    server.use(u1.handler);

    const { result, queryClient } = renderHookWithProviders(() => useUsers(), MANAGER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(queryClient.getQueryData(settingsKeys.users())).toEqual(result.current.data);
    expect(u1.requests).toHaveLength(1);
  });

  it('is disabled without user:read, and the decision says why', async () => {
    const u1 = listUsersHandler();
    server.use(u1.handler);

    const { result } = renderHookWithProviders(() => useUsers(), signedIn([]));

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.decision.reason).toBe('Requires the "user:read" permission.');
    expect(u1.requests).toHaveLength(0);
  });
});

describe('useRoles (R1, AC-14)', () => {
  it('loads the roles with role:read', async () => {
    const r1 = listRolesHandler();
    server.use(r1.handler);

    const { result, queryClient } = renderHookWithProviders(() => useRoles(), MANAGER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(settingsKeys.roles())).toEqual(result.current.data);
  });

  it('sends no request without role:read', async () => {
    const r1 = listRolesHandler();
    server.use(r1.handler);

    const { result } = renderHookWithProviders(() => useRoles(), signedIn(['user:read']));

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.decision.allowed).toBe(false);
    expect(r1.requests).toHaveLength(0);
  });
});

describe('useAssignRole (U3, AC-6, AC-11, AC-15)', () => {
  const VARS = { userId: 'user-2', roleId: 'role-guest', targetLevel: 20, newRoleLevel: 0 };

  it('sends U3 { roleId } and invalidates users', async () => {
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useAssignRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.users(), STALE);

    await act(() => result.current.mutateAsync(VARS));

    expect(u3.requests[0]?.body).toEqual({ roleId: 'role-guest' });
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(true);
  });

  it.each([
    ['the actor is the target', { ...VARS, userId: 'me' }, 'You cannot change your own role.'],
    [
      'the target is not lower',
      { ...VARS, targetLevel: 100 },
      'Requires a higher role level than the target user.',
    ],
    [
      'the target level is unknown',
      { ...VARS, targetLevel: undefined },
      'Requires a higher role level than the target user.',
    ],
    [
      'the new role is not lower',
      { ...VARS, newRoleLevel: 100 },
      'The new role level must be lower than your own.',
    ],
  ])('rejects before any request when %s', async (_, vars, reason) => {
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useAssignRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.users(), STALE);

    const error = await result.current.mutateAsync(vars).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: reason });
    expect(u3.requests).toHaveLength(0);
    expect(queryClient.getQueryData(settingsKeys.users())).toBe(STALE);
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(false);
  });

  it('rejects without user:role_manager', async () => {
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);
    const { result } = renderHookWithProviders(() => useAssignRole(), signedIn(['user:read']));

    await expect(result.current.mutateAsync(VARS)).rejects.toMatchObject({
      message: 'Requires the "user:role_manager" permission.',
    });
    expect(u3.requests).toHaveLength(0);
  });

  it('leaves the cache unchanged on a server 403', async () => {
    server.use(updateUserRoleHandler(settingsErrorReply(403, 'Role level too high')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useAssignRole(), MANAGER);
    queryClient.setQueryData(settingsKeys.users(), STALE);

    await expect(result.current.mutateAsync(VARS)).rejects.toMatchObject({
      status: 403,
      message: 'Role level too high',
    });
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(false);
  });
});

describe('useDeleteUser (U4, AC-6, AC-11, AC-16)', () => {
  const VARS = { userId: 'user-2', targetLevel: 20 };

  it('sends U4 and invalidates users', async () => {
    const u4 = deleteUserHandler();
    server.use(u4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteUser(), MANAGER);
    queryClient.setQueryData(settingsKeys.users(), STALE);

    await act(() => result.current.mutateAsync(VARS));

    expect(u4.requests[0]?.params.id).toBe('user-2');
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(true);
  });

  it.each([
    ['the actor is the target', { ...VARS, userId: 'me' }, 'You cannot delete your own account.'],
    [
      'the target level is unknown',
      { ...VARS, targetLevel: undefined },
      'Requires a higher role level than the target user.',
    ],
  ])('rejects before any request when %s', async (_, vars, reason) => {
    const u4 = deleteUserHandler();
    server.use(u4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteUser(), MANAGER);
    queryClient.setQueryData(settingsKeys.users(), STALE);

    await expect(result.current.mutateAsync(vars)).rejects.toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: reason,
    });
    expect(u4.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.users())?.isInvalidated).toBe(false);
  });
});

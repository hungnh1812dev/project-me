import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeMeUser, makePermission, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createPermissionHandler,
  deletePermissionHandler,
  listPermissionsHandler,
  settingsErrorReply,
  updatePermissionHandler,
} from '@/test/msw/settingsHandlers';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import {
  useCreatePermission,
  useDeletePermission,
  usePermissions,
  useUpdatePermission,
} from './usePermissions';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const MANAGER = signedIn(['permission:manager']);
const READER = signedIn(['permission:read']);
const STALE = [makePermission({ documentId: 'stale' })];
const DENIED = 'Requires the "permission:manager" permission.';

describe('usePermissions (P1)', () => {
  it('loads the catalog under settingsKeys.permissions()', async () => {
    const p1 = listPermissionsHandler();
    server.use(p1.handler);

    const { result, queryClient } = renderHookWithProviders(() => usePermissions(), READER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(settingsKeys.permissions())).toEqual(result.current.data);
    expect(p1.requests).toHaveLength(1);
  });

  it('is disabled without permission:read, and the decision says why', async () => {
    const p1 = listPermissionsHandler();
    server.use(p1.handler);

    const { result } = renderHookWithProviders(() => usePermissions(), signedIn([]));

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.decision.reason).toBe('Requires the "permission:read" permission.');
    expect(p1.requests).toHaveLength(0);
  });
});

describe('useCreatePermission (P2, AC-6, AC-11)', () => {
  const INPUT = { slug: 'article:export', name: 'Export', description: 'As CSV.' };

  it('sends P2 and invalidates permissions', async () => {
    const p2 = createPermissionHandler();
    server.use(p2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreatePermission(), MANAGER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await act(() => result.current.mutateAsync(INPUT));

    expect(p2.requests[0]?.body).toEqual(INPUT);
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without permission:manager', async () => {
    const p2 = createPermissionHandler();
    server.use(p2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreatePermission(), READER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    const error = await result.current.mutateAsync(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: DENIED });
    expect(p2.requests).toHaveLength(0);
    expect(queryClient.getQueryData(settingsKeys.permissions())).toBe(STALE);
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(false);
  });

  it('leaves the cache unchanged on a server 409', async () => {
    server.use(createPermissionHandler(settingsErrorReply(409, 'Slug exists')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreatePermission(), MANAGER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({ status: 409 });
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(false);
  });
});

describe('useUpdatePermission (P3, AC-6, AC-11)', () => {
  const VARS = { id: 'perm-1', changes: { description: 'New.' } };

  it('sends P3 with the changes and invalidates permissions', async () => {
    const p3 = updatePermissionHandler();
    server.use(p3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useUpdatePermission(), MANAGER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await act(() => result.current.mutateAsync(VARS));

    expect(p3.requests[0]?.body).toEqual({ description: 'New.' });
    expect(p3.requests[0]?.params.id).toBe('perm-1');
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without permission:manager', async () => {
    const p3 = updatePermissionHandler();
    server.use(p3.handler);
    const { result } = renderHookWithProviders(() => useUpdatePermission(), READER);

    await expect(result.current.mutateAsync(VARS)).rejects.toMatchObject({
      code: 'ERR_CLIENT_FORBIDDEN',
      message: DENIED,
    });
    expect(p3.requests).toHaveLength(0);
  });
});

describe('useDeletePermission (P4, AC-6, AC-11, AC-27)', () => {
  it('sends P4 and invalidates permissions', async () => {
    const p4 = deletePermissionHandler();
    server.use(p4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeletePermission(), MANAGER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await act(() => result.current.mutateAsync('perm-1'));

    expect(p4.requests[0]?.params.id).toBe('perm-1');
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without permission:manager', async () => {
    const p4 = deletePermissionHandler();
    server.use(p4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeletePermission(), READER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await expect(result.current.mutateAsync('perm-1')).rejects.toMatchObject({
      status: 403,
      message: DENIED,
    });
    expect(p4.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(false);
  });

  it('rejects a 409 with its body and leaves the cache unchanged', async () => {
    server.use(deletePermissionHandler(settingsErrorReply(409, 'In use')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeletePermission(), MANAGER);
    queryClient.setQueryData(settingsKeys.permissions(), STALE);

    await expect(result.current.mutateAsync('perm-1')).rejects.toMatchObject({ status: 409 });
    expect(queryClient.getQueryState(settingsKeys.permissions())?.isInvalidated).toBe(false);
  });
});

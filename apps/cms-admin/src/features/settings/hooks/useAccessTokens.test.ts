import type { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeAccessToken, makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createAccessTokenHandler,
  deleteAccessTokenHandler,
  listAccessTokensHandler,
  revokeAccessTokenHandler,
  settingsErrorReply,
} from '@/test/msw/settingsHandlers';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import {
  useAccessTokens,
  useCreateAccessToken,
  useDeleteAccessToken,
  useRevokeAccessToken,
} from './useAccessTokens';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions, level: 100 }) }),
    },
  };
}

const MANAGER = signedIn(['api_token:read', 'api_token:manager']);
const READER = signedIn(['api_token:read']);
const STALE = [makeAccessToken({ documentId: 'stale' })];
const DENIED = 'Requires the "api_token:manager" permission.';
const INPUT = { name: 'CI', permissions: ['document:read'], expiresIn: '1m' as const };

/** Everything both React Query caches hold, serialized, to search for a secret (AC-33). */
function cacheText(queryClient: QueryClient): string {
  return JSON.stringify({
    queries: queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state),
    mutations: queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state),
  });
}

describe('useAccessTokens (T1)', () => {
  it('loads the list with api_token:read', async () => {
    server.use(listAccessTokensHandler().handler);
    const { result } = renderHookWithProviders(() => useAccessTokens(), READER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((token) => token.name)).toEqual(['CI deploy', 'Preview']);
  });

  it('sends no request without api_token:read and says why', () => {
    const t1 = listAccessTokensHandler();
    server.use(t1.handler);
    const { result } = renderHookWithProviders(() => useAccessTokens(), signedIn([]));

    expect(result.current.decision.allowed).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(t1.requests).toHaveLength(0);
  });
});

describe('useCreateAccessToken (T2, AC-6, AC-11, AC-33)', () => {
  it('sends T2, resolves with the secret and invalidates accessTokens', async () => {
    const t2 = createAccessTokenHandler();
    server.use(t2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    const created = await act(() => result.current.mutateAsync(INPUT));

    expect(created.token).toBe('cms_secret_1');
    expect(t2.requests[0]?.body).toEqual(INPUT);
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(true);
  });

  it('keeps the secret out of every cache entry once reset', async () => {
    server.use(createAccessTokenHandler().handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await act(() => result.current.mutateAsync(INPUT));
    expect(queryClient.getQueryData(settingsKeys.accessTokens())).toBe(STALE);
    act(() => result.current.reset());

    await waitFor(() => expect(cacheText(queryClient)).not.toContain('cms_secret_1'));
  });

  it('rejects before any request without api_token:manager', async () => {
    const t2 = createAccessTokenHandler();
    server.use(t2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateAccessToken(), READER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    const error = await result.current.mutateAsync(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: DENIED });
    expect(t2.requests).toHaveLength(0);
    expect(queryClient.getQueryData(settingsKeys.accessTokens())).toBe(STALE);
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(false);
  });

  it('leaves the cache unchanged on a server 400', async () => {
    server.use(createAccessTokenHandler(settingsErrorReply(400, 'Unknown slug')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useCreateAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({ status: 400 });
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(false);
  });
});

describe('useRevokeAccessToken (T3, AC-6, AC-11, AC-31, AC-33)', () => {
  it('sends T3 with {}, resolves with the new secret and invalidates accessTokens', async () => {
    const t3 = revokeAccessTokenHandler();
    server.use(t3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useRevokeAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    const revoked = await act(() => result.current.mutateAsync('tok-1'));

    expect(revoked.token).toBe('cms_secret_rotated');
    expect(t3.requests[0]).toMatchObject({ body: {}, params: { id: 'tok-1' } });
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(true);
  });

  it('keeps the new secret out of every cache entry once reset', async () => {
    server.use(revokeAccessTokenHandler().handler);
    const { result, queryClient } = renderHookWithProviders(() => useRevokeAccessToken(), MANAGER);

    await act(() => result.current.mutateAsync('tok-1'));
    act(() => result.current.reset());

    await waitFor(() => expect(cacheText(queryClient)).not.toContain('cms_secret_rotated'));
  });

  it('rejects before any request without api_token:manager', async () => {
    const t3 = revokeAccessTokenHandler();
    server.use(t3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useRevokeAccessToken(), READER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await expect(result.current.mutateAsync('tok-1')).rejects.toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
    });
    expect(t3.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(false);
  });
});

describe('useDeleteAccessToken (T4, AC-6, AC-11)', () => {
  it('sends T4 and invalidates accessTokens', async () => {
    const t4 = deleteAccessTokenHandler();
    server.use(t4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await act(() => result.current.mutateAsync('tok-1'));

    expect(t4.requests[0]?.params.id).toBe('tok-1');
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without api_token:manager', async () => {
    const t4 = deleteAccessTokenHandler();
    server.use(t4.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteAccessToken(), READER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await expect(result.current.mutateAsync('tok-1')).rejects.toMatchObject({ status: 403 });
    expect(t4.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(false);
  });

  it('leaves the cache unchanged on a server 404', async () => {
    server.use(deleteAccessTokenHandler(settingsErrorReply(404, 'Not found')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteAccessToken(), MANAGER);
    queryClient.setQueryData(settingsKeys.accessTokens(), STALE);

    await expect(result.current.mutateAsync('tok-1')).rejects.toMatchObject({ status: 404 });
    expect(queryClient.getQueryState(settingsKeys.accessTokens())?.isInvalidated).toBe(false);
  });
});

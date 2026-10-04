import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { makeQueryClient } from '@/app/queryClient';
import { makeStore } from '@/app/store';
import { sessionExpired } from '@/features/auth/store/AuthSlice';
import { logout } from '@/features/auth/store/sessionThunks';
import {
  makeContentType,
  makeContentTypeSummary,
  makeDocument,
  makeListResponse,
} from '@/test/contentFixtures';
import { makeMeUser } from '@/test/fixtures';

import { contentKeys } from './queryKeys';

/** Seeds one entry under every kind of content key. */
function seedContent(queryClient: QueryClient) {
  queryClient.setQueryData(contentKeys.typeList(), [makeContentTypeSummary()]);
  queryClient.setQueryData(contentKeys.type('article'), makeContentType());
  queryClient.setQueryData(contentKeys.single('home'), makeDocument());
  queryClient.setQueryData(contentKeys.list('article', { start: 20 }), makeListResponse());
  queryClient.setQueryData(contentKeys.detail('article', 'doc-1'), makeDocument());
  expect(queryClient.getQueryCache().findAll({ queryKey: contentKeys.all })).toHaveLength(5);
}

function signedInStore() {
  const queryClient = makeQueryClient();
  const store = makeStore({
    queryClient,
    preloadedAuth: { status: 'authenticated', accessToken: 'token', user: makeMeUser() },
  });
  seedContent(queryClient);
  return { store, queryClient };
}

describe('content cache purge (AC-28)', () => {
  it('logout() leaves no content query', async () => {
    const { store, queryClient } = signedInStore();

    await store.dispatch(logout());

    expect(queryClient.getQueryCache().findAll({ queryKey: contentKeys.all })).toEqual([]);
  });

  it('sessionExpired() leaves no content query', () => {
    const { store, queryClient } = signedInStore();

    store.dispatch(sessionExpired());

    expect(queryClient.getQueryCache().findAll({ queryKey: contentKeys.all })).toEqual([]);
  });
});

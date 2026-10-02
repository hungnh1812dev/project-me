import { act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { cmsApi } from '@/core/api/CmsApi';
import { makeDocument, makeListedItem, makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { errorReply, getDocumentHandler, listDocumentsHandler } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import type { ContentTypeRef, ListParams } from '../types';
import { useDocument, useDocumentList } from './useCollectionQueries';

function signedIn(permissions: string[], accessToken: string | null = null) {
  return {
    auth: {
      status: 'authenticated' as const,
      accessToken,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const ARTICLE: ContentTypeRef = { slug: 'article', draftToPublish: true };
const READER = signedIn(['document:read:article']);

/** A promise plus its resolver, to hold a response open. */
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useDocumentList (AC-14)', () => {
  it('calls D1 and caches the ListDocumentsResponse under list(slug, normalized params)', async () => {
    const d1 = listDocumentsHandler();
    server.use(d1.handler);

    const { result, queryClient } = renderHookWithProviders(
      () => useDocumentList(ARTICLE, { start: 0, orderBy: 'createdAt', sortDir: 'asc' }),
      READER,
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(makeListResponse());
    expect(result.current.data?.items[0]).toEqual(makeListedItem());
    expect(d1.requests).toHaveLength(1);
    expect(d1.requests[0]?.url.pathname).toBe('/api/v1/documents/collection-type/article');
    expect(d1.requests[0]?.url.search).toBe('?orderBy=created_at&sortDir=asc');
    expect(
      queryClient.getQueryData(
        contentKeys.list('article', { orderBy: 'createdAt', sortDir: 'asc' }),
      ),
    ).toEqual(makeListResponse());
  });

  it('shares one cache entry and one request between {} and { start: 0 }', async () => {
    const d1 = listDocumentsHandler();
    server.use(d1.handler);

    const { result } = renderHookWithProviders(
      () => [useDocumentList(ARTICLE, {}), useDocumentList(ARTICLE, { start: 0 })] as const,
      READER,
    );

    await waitFor(() => expect(result.current[1].isSuccess).toBe(true));
    expect(result.current[0].data).toBe(result.current[1].data);
    expect(d1.requests).toHaveLength(1);
    expect(d1.requests[0]?.url.search).toBe('');
  });

  it('keeps the previous page visible (isPlaceholderData) while the next one loads', async () => {
    const nextPage = deferred();
    const first = makeListResponse({ total: 40 });
    const second = makeListResponse({
      items: [makeListedItem({ id: 21, documentId: 'doc-21' })],
      total: 40,
      start: 20,
    });
    server.use(
      http.get('*/api/v1/documents/collection-type/:slug', async ({ request }) => {
        if (new URL(request.url).searchParams.get('start') === '20') {
          await nextPage.promise;
          return HttpResponse.json(second);
        }
        return HttpResponse.json(first);
      }),
    );
    let params: ListParams = {};

    const { result, rerender } = renderHookWithProviders(
      () => useDocumentList(ARTICLE, params),
      READER,
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    params = { start: 20 };
    rerender();

    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toEqual(first);
    expect(result.current.isPlaceholderData).toBe(true);

    nextPage.resolve();
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data).toEqual(second);
  });

  it.each<[string, ListParams]>([
    ['an orderBy that is not a plain identifier (AC-3)', { orderBy: 'x][$ne' }],
    ['a filter key that is not a plain identifier (AC-3)', { filters: { 'x][$ne': { $eq: 1 } } }],
    ['a search over 256 characters (AC-7)', { search: 'a'.repeat(257) }],
    [
      'a string filter value over 256 characters (AC-7)',
      { filters: { title: { $contains: 'a'.repeat(257) } } },
    ],
  ])('rejects %s with 400 ERR_CLIENT_VALIDATION and sends no request', async (_case, params) => {
    const d1 = listDocumentsHandler();
    server.use(d1.handler);

    const { result } = renderHookWithProviders(() => useDocumentList(ARTICLE, params), READER);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 400, code: 'ERR_CLIENT_VALIDATION' });
    expect(d1.requests).toHaveLength(0);
  });

  it('is disabled when scoped read is denied', async () => {
    const d1 = listDocumentsHandler();
    server.use(d1.handler);

    const { result } = renderHookWithProviders(
      () => useDocumentList(ARTICLE, {}),
      signedIn(['document:read:news']),
    );

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(d1.requests).toHaveLength(0);
  });

  it('surfaces a server 403 as an ApiError without retry, refresh or sign-out (AC-26)', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'fresh' });
      }),
    );
    const d1 = listDocumentsHandler(errorReply(403, 'Forbidden resource'));
    server.use(d1.handler);

    const { result, store } = renderHookWithProviders(
      () => useDocumentList(ARTICLE, {}),
      signedIn(['document:read:article'], 'valid'),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(403);
    expect(d1.requests).toHaveLength(1);
    expect(refreshes).toBe(0);
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', accessToken: 'valid' });
  });

  it('recovers from an expired bearer with one refresh and one retry (AC-27)', async () => {
    let refreshes = 0;
    const seen: (string | null)[] = [];
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'fresh' });
      }),
      http.get('*/api/v1/documents/collection-type/:slug', ({ request }) => {
        const auth = request.headers.get('Authorization');
        seen.push(auth);
        return auth === 'Bearer fresh'
          ? HttpResponse.json(makeListResponse())
          : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });
      }),
    );

    const { result, store } = renderHookWithProviders(
      () => useDocumentList(ARTICLE, {}),
      signedIn(['document:read:article'], 'expired'),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(makeListResponse());
    expect(refreshes).toBe(1);
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh']);
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', accessToken: 'fresh' });
  });

  it('aborts the in-flight request when unmounted (AC-29)', async () => {
    // MSW's XMLHttpRequest interceptor does not mirror `xhr.abort()` onto `request.signal`, so the
    // signal is read where axios receives it: the request config of the in-flight D1 call.
    const hold = deferred();
    let served = 0;
    server.use(
      http.get('*/api/v1/documents/collection-type/:slug', async () => {
        served += 1;
        await hold.promise;
        return HttpResponse.json(makeListResponse());
      }),
    );
    const signals: (AbortSignal | undefined)[] = [];
    const interceptor = cmsApi.interceptors.request.use((config) => {
      signals.push(config.signal as AbortSignal | undefined);
      return config;
    });

    try {
      const { unmount, queryClient } = renderHookWithProviders(
        () => useDocumentList(ARTICLE, {}),
        READER,
      );
      await waitFor(() => expect(served).toBe(1));
      expect(signals[0]?.aborted).toBe(false);

      unmount();

      await waitFor(() => expect(signals[0]?.aborted).toBe(true));
      expect(queryClient.getQueryState(contentKeys.list('article', {}))?.fetchStatus).toBe('idle');
    } finally {
      cmsApi.interceptors.request.eject(interceptor);
      hold.resolve();
    }
  });
});

describe('useDocument (AC-15)', () => {
  it('calls D3 and resolves the unwrapped Document under detail(slug, id)', async () => {
    const d3 = getDocumentHandler();
    server.use(d3.handler);

    const { result, queryClient } = renderHookWithProviders(
      () => useDocument(ARTICLE, 'doc-7'),
      READER,
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const expected = makeDocument({ documentId: 'doc-7' });
    expect(result.current.data).toEqual(expected);
    expect(queryClient.getQueryData(contentKeys.detail('article', 'doc-7'))).toEqual(expected);
    expect(d3.requests).toHaveLength(1);
    expect(d3.requests[0]?.url.pathname).toBe('/api/v1/documents/collection-type/article/doc-7');
  });

  it('is disabled for an empty documentId', async () => {
    const d3 = getDocumentHandler();
    server.use(d3.handler);

    const { result } = renderHookWithProviders(() => useDocument(ARTICLE, ''), READER);

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(d3.requests).toHaveLength(0);
  });

  it('is disabled when scoped read is denied', async () => {
    const d3 = getDocumentHandler();
    server.use(d3.handler);

    const { result } = renderHookWithProviders(
      () => useDocument(ARTICLE, 'doc-7'),
      signedIn(['document:read:news']),
    );

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(d3.requests).toHaveLength(0);
  });

  it('surfaces a 404 as an ApiError 404 after exactly one request', async () => {
    const d3 = getDocumentHandler(errorReply(404, 'Document not found'));
    server.use(d3.handler);

    const { result } = renderHookWithProviders(() => useDocument(ARTICLE, 'missing'), READER);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(404);
    expect(d3.requests).toHaveLength(1);
  });
});

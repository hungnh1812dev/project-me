import type { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeDocument, makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  createDocumentHandler,
  deleteDocumentHandler,
  duplicateDocumentHandler,
  errorReply,
  publishDocumentHandler,
  unpublishDocumentHandler,
  updateDocumentHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import type { ContentTypeRef } from '../types';
import {
  useCreateDocument,
  useDeleteDocument,
  useDuplicateDocument,
  usePublishDocument,
  useUnpublishDocument,
  useUpdateDocument,
} from './useCollectionMutations';

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
const ARTICLE_MODE_B: ContentTypeRef = { slug: 'article', draftToPublish: false };
const EDITOR = signedIn(
  ['read', 'create', 'update', 'delete', 'publish', 'unpublish'].map(
    (action) => `document:${action}:article`,
  ),
);

const ARTICLE_LIST = contentKeys.list('article', {});
const ARTICLE_PAGE_2 = contentKeys.list('article', { start: 20 });
const NEWS_LIST = contentKeys.list('news', {});
const DOC_1 = contentKeys.detail('article', 'doc-1');
const DOC_2 = contentKeys.detail('article', 'doc-2');

/** Seeds two article pages, a news page and two article details, and returns them. */
function seed(queryClient: QueryClient) {
  const entries = {
    articleList: makeListResponse(),
    articlePage2: makeListResponse({ start: 20 }),
    newsList: makeListResponse(),
    doc1: makeDocument({ documentId: 'doc-1' }),
    doc2: makeDocument({ documentId: 'doc-2' }),
  };
  queryClient.setQueryData(ARTICLE_LIST, entries.articleList);
  queryClient.setQueryData(ARTICLE_PAGE_2, entries.articlePage2);
  queryClient.setQueryData(NEWS_LIST, entries.newsList);
  queryClient.setQueryData(DOC_1, entries.doc1);
  queryClient.setQueryData(DOC_2, entries.doc2);
  return entries;
}

function invalidated(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.getQueryState(key)?.isInvalidated;
}

/** Every seeded entry is still there, as the same object, and none is invalidated. */
function expectCacheUntouched(queryClient: QueryClient, entries: ReturnType<typeof seed>) {
  expect(queryClient.getQueryData(ARTICLE_LIST)).toBe(entries.articleList);
  expect(queryClient.getQueryData(ARTICLE_PAGE_2)).toBe(entries.articlePage2);
  expect(queryClient.getQueryData(NEWS_LIST)).toBe(entries.newsList);
  expect(queryClient.getQueryData(DOC_1)).toBe(entries.doc1);
  expect(queryClient.getQueryData(DOC_2)).toBe(entries.doc2);
  for (const key of [ARTICLE_LIST, ARTICLE_PAGE_2, NEWS_LIST, DOC_1, DOC_2]) {
    expect(invalidated(queryClient, key)).toBe(false);
  }
}

/** `lists('article')` is invalidated, `news` is not. */
function expectArticleListsInvalidated(queryClient: QueryClient) {
  expect(invalidated(queryClient, ARTICLE_LIST)).toBe(true);
  expect(invalidated(queryClient, ARTICLE_PAGE_2)).toBe(true);
  expect(invalidated(queryClient, NEWS_LIST)).toBe(false);
}

const forbidden = (permission: string) => ({
  status: 403,
  code: 'ERR_CLIENT_FORBIDDEN',
  message: `Requires the "${permission}" permission.`,
});

describe('useCreateDocument (AC-16)', () => {
  it('POSTs { data }, seeds detail(slug, new id) and invalidates lists(slug)', async () => {
    const d2 = createDocumentHandler();
    server.use(d2.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useCreateDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({ title: 'New' });
    });

    const expected = makeDocument({ documentId: 'doc-new', title: 'New' });
    expect(created).toEqual(expected);
    expect(d2.requests).toHaveLength(1);
    expect(d2.requests[0]).toMatchObject({ method: 'POST', body: { data: { title: 'New' } } });
    expect(queryClient.getQueryData(contentKeys.detail('article', 'doc-new'))).toEqual(expected);
    expectArticleListsInvalidated(queryClient);
    expect(queryClient.getQueryData(DOC_1)).toBe(entries.doc1);
    expect(invalidated(queryClient, DOC_1)).toBe(false);
  });

  it('is denied without scoped create: no request, no cache change (AC-25)', async () => {
    const d2 = createDocumentHandler();
    server.use(d2.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useCreateDocument(ARTICLE),
      signedIn(['document:create:news']),
    );
    const entries = seed(queryClient);

    const error = await act(() =>
      result.current.mutateAsync({ title: 'x' }).catch((e: unknown) => e),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject(forbidden('document:create:article'));
    expect(d2.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('leaves the cache untouched on a server 400', async () => {
    const d2 = createDocumentHandler(errorReply(400, 'title must be a string'));
    server.use(d2.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useCreateDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() =>
      result.current.mutateAsync({ title: 1 }).catch((e: unknown) => e),
    );

    expect(error).toMatchObject({ status: 400, message: 'title must be a string' });
    expectCacheUntouched(queryClient, entries);
  });
});

describe('useUpdateDocument (AC-17)', () => {
  it('PUTs { data }, writes detail(slug, id) and invalidates lists(slug)', async () => {
    const d4 = updateDocumentHandler();
    server.use(d4.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useUpdateDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let updated: unknown;
    await act(async () => {
      updated = await result.current.mutateAsync({
        documentId: 'doc-1',
        data: { title: 'Edited' },
      });
    });

    const expected = makeDocument({ documentId: 'doc-1', status: 'modified', title: 'Edited' });
    expect(updated).toEqual(expected);
    expect(d4.requests).toHaveLength(1);
    expect(d4.requests[0]).toMatchObject({ method: 'PUT', body: { data: { title: 'Edited' } } });
    expect(d4.requests[0]?.url.pathname).toBe('/api/v1/documents/collection-type/article/doc-1');
    expect(queryClient.getQueryData(DOC_1)).toEqual(expected);
    expectArticleListsInvalidated(queryClient);
    expect(queryClient.getQueryData(DOC_2)).toBe(entries.doc2);
  });

  it('is denied without scoped update: no request, no cache change (AC-25)', async () => {
    const d4 = updateDocumentHandler();
    server.use(d4.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useUpdateDocument(ARTICLE),
      signedIn(['document:update:news']),
    );
    const entries = seed(queryClient);

    const error = await act(() =>
      result.current.mutateAsync({ documentId: 'doc-1', data: {} }).catch((e: unknown) => e),
    );

    expect(error).toMatchObject(forbidden('document:update:article'));
    expect(d4.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('rejects a server 403 as ApiError 403 with no retry, no refresh and the session kept (AC-26)', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'fresh' });
      }),
    );
    const d4 = updateDocumentHandler(errorReply(403, 'Forbidden resource'));
    server.use(d4.handler);
    const { result, queryClient, store } = renderHookWithProviders(
      () => useUpdateDocument(ARTICLE),
      signedIn(['document:update:article'], 'valid'),
    );
    const entries = seed(queryClient);

    const error = await act(() =>
      result.current.mutateAsync({ documentId: 'doc-1', data: {} }).catch((e: unknown) => e),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'Forbidden resource' });
    expect(d4.requests).toHaveLength(1);
    expect(refreshes).toBe(0);
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', accessToken: 'valid' });
    expectCacheUntouched(queryClient, entries);
  });
});

describe('useDeleteDocument (AC-18)', () => {
  it('DELETEs, removes detail(slug, id) and invalidates lists(slug)', async () => {
    const d5 = deleteDocumentHandler();
    server.use(d5.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDeleteDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    await act(async () => {
      await result.current.mutateAsync('doc-1');
    });

    expect(d5.requests).toHaveLength(1);
    expect(d5.requests[0]).toMatchObject({ method: 'DELETE' });
    expect(d5.requests[0]?.url.pathname).toBe('/api/v1/documents/collection-type/article/doc-1');
    expect(queryClient.getQueryState(DOC_1)).toBeUndefined();
    expect(queryClient.getQueryData(DOC_2)).toBe(entries.doc2);
    expectArticleListsInvalidated(queryClient);
  });

  it('is denied without scoped delete: no request, no cache change (AC-25)', async () => {
    const d5 = deleteDocumentHandler();
    server.use(d5.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDeleteDocument(ARTICLE),
      signedIn(['document:delete:news']),
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject(forbidden('document:delete:article'));
    expect(d5.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('leaves the cache untouched on a server 404', async () => {
    const d5 = deleteDocumentHandler(errorReply(404, 'Document not found'));
    server.use(d5.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDeleteDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject({ status: 404 });
    expectCacheUntouched(queryClient, entries);
  });
});

describe('useDuplicateDocument (AC-19)', () => {
  it('POSTs /duplicate, seeds detail(slug, copy id), invalidates lists(slug), resolves the draft', async () => {
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDuplicateDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let copy: unknown;
    await act(async () => {
      copy = await result.current.mutateAsync('doc-1');
    });

    const expected = makeDocument({ documentId: 'doc-1-copy', status: 'draft' });
    expect(copy).toEqual(expected);
    expect(d8.requests).toHaveLength(1);
    expect(d8.requests[0]?.url.pathname).toBe(
      '/api/v1/documents/collection-type/article/doc-1/duplicate',
    );
    expect(queryClient.getQueryData(contentKeys.detail('article', 'doc-1-copy'))).toEqual(expected);
    expect(queryClient.getQueryData(DOC_1)).toBe(entries.doc1);
    expect(invalidated(queryClient, DOC_1)).toBe(false);
    expectArticleListsInvalidated(queryClient);
  });

  it('is denied without scoped create: no request, no cache change (AC-25)', async () => {
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDuplicateDocument(ARTICLE),
      signedIn(['document:read:article', 'document:update:article']),
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject(forbidden('document:create:article'));
    expect(d8.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('leaves the cache untouched on a server 404', async () => {
    const d8 = duplicateDocumentHandler(errorReply(404, 'Document not found'));
    server.use(d8.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useDuplicateDocument(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject({ status: 404 });
    expectCacheUntouched(queryClient, entries);
  });
});

describe.each([
  {
    name: 'usePublishDocument',
    useHook: usePublishDocument,
    handler: publishDocumentHandler,
    action: 'publish',
    status: 'published',
  },
  {
    name: 'useUnpublishDocument',
    useHook: useUnpublishDocument,
    handler: unpublishDocumentHandler,
    action: 'unpublish',
    status: 'draft',
  },
] as const)('$name (AC-20)', ({ useHook, handler, action, status }) => {
  it(`POSTs /${action}, returns the PublishResult and invalidates detail(slug, id) and lists(slug)`, async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(() => useHook(ARTICLE), EDITOR);
    const entries = seed(queryClient);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync('doc-1');
    });

    expect(outcome).toEqual({ status });
    expect(recorder.requests).toHaveLength(1);
    expect(recorder.requests[0]?.url.pathname).toBe(
      `/api/v1/documents/collection-type/article/doc-1/${action}`,
    );
    expect(invalidated(queryClient, DOC_1)).toBe(true);
    expect(queryClient.getQueryData(DOC_1)).toBe(entries.doc1);
    expect(invalidated(queryClient, DOC_2)).toBe(false);
    expectArticleListsInvalidated(queryClient);
  });

  it(`is denied without the scoped ${action} permission: no request, no cache change (AC-25)`, async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useHook(ARTICLE),
      signedIn([`document:${action}:news`]),
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject(forbidden(`document:${action}:article`));
    expect(recorder.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('is denied when draftToPublish is false: no request, no cache change', async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(() => useHook(ARTICLE_MODE_B), EDITOR);
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'This content type does not use draft and publish.',
    });
    expect(recorder.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('leaves the cache untouched on a server 400', async () => {
    const recorder = handler(errorReply(400, 'Already published'));
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(() => useHook(ARTICLE), EDITOR);
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync('doc-1').catch((e: unknown) => e));

    expect(error).toMatchObject({ status: 400, message: 'Already published' });
    expectCacheUntouched(queryClient, entries);
  });
});

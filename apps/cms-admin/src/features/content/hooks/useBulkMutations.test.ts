import type { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeDocument, makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  bulkCreateDocumentsHandler,
  bulkDeleteDocumentsHandler,
  errorReply,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import type { BulkDeleteResult, ContentTypeRef, DocumentData } from '../types';
import { useBulkCreateDocuments, useBulkDeleteDocuments } from './useCollectionMutations';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const ARTICLE: ContentTypeRef = { slug: 'article', draftToPublish: true };
const ARTICLE_MODE_B: ContentTypeRef = { slug: 'article', draftToPublish: false };
const EDITOR = signedIn([
  'document:create:article',
  'document:publish:article',
  'document:delete:article',
]);

const ARTICLE_LIST = contentKeys.list('article', {});
const NEWS_LIST = contentKeys.list('news', {});
const detail = (id: string) => contentKeys.detail('article', id);

/** Seeds an article page, a news page and three article details, and returns them. */
function seed(queryClient: QueryClient) {
  const entries = {
    articleList: makeListResponse(),
    newsList: makeListResponse(),
    a: makeDocument({ documentId: 'a' }),
    b: makeDocument({ documentId: 'b' }),
    c: makeDocument({ documentId: 'c' }),
  };
  queryClient.setQueryData(ARTICLE_LIST, entries.articleList);
  queryClient.setQueryData(NEWS_LIST, entries.newsList);
  queryClient.setQueryData(detail('a'), entries.a);
  queryClient.setQueryData(detail('b'), entries.b);
  queryClient.setQueryData(detail('c'), entries.c);
  return entries;
}

function invalidated(queryClient: QueryClient, key: readonly unknown[]) {
  return queryClient.getQueryState(key)?.isInvalidated;
}

function expectCacheUntouched(queryClient: QueryClient, entries: ReturnType<typeof seed>) {
  expect(queryClient.getQueryData(ARTICLE_LIST)).toBe(entries.articleList);
  expect(queryClient.getQueryData(NEWS_LIST)).toBe(entries.newsList);
  expect(queryClient.getQueryData(detail('a'))).toBe(entries.a);
  expect(queryClient.getQueryData(detail('b'))).toBe(entries.b);
  expect(queryClient.getQueryData(detail('c'))).toBe(entries.c);
  for (const key of [ARTICLE_LIST, NEWS_LIST, detail('a'), detail('b'), detail('c')]) {
    expect(invalidated(queryClient, key)).toBe(false);
  }
  expect(queryClient.getQueryCache().getAll()).toHaveLength(5);
}

const items = (n: number): DocumentData[] =>
  Array.from({ length: n }, (_, i) => ({ title: `Item ${i + 1}` }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i + 1}`);

describe('useBulkCreateDocuments (AC-21)', () => {
  it('POSTs { items: { data }[] }, seeds one detail per created item and invalidates lists(slug)', async () => {
    const d9 = bulkCreateDocumentsHandler();
    server.use(d9.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkCreateDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync(items(2));
    });

    const first = makeDocument({ documentId: 'doc-bulk-1', status: 'published', title: 'Item 1' });
    const second = makeDocument({ documentId: 'doc-bulk-2', status: 'published', title: 'Item 2' });
    expect(created).toEqual([first, second]);
    expect(d9.requests).toHaveLength(1);
    expect(d9.requests[0]).toMatchObject({
      method: 'POST',
      body: { items: [{ data: { title: 'Item 1' } }, { data: { title: 'Item 2' } }] },
    });
    expect(queryClient.getQueryData(detail('doc-bulk-1'))).toEqual(first);
    expect(queryClient.getQueryData(detail('doc-bulk-2'))).toEqual(second);
    expect(invalidated(queryClient, ARTICLE_LIST)).toBe(true);
    expect(invalidated(queryClient, NEWS_LIST)).toBe(false);
    expect(queryClient.getQueryData(detail('a'))).toBe(entries.a);
  });

  it('accepts exactly 100 items', async () => {
    const d9 = bulkCreateDocumentsHandler();
    server.use(d9.handler);
    const { result } = renderHookWithProviders(() => useBulkCreateDocuments(ARTICLE), EDITOR);

    await act(async () => {
      await result.current.mutateAsync(items(100));
    });

    expect(d9.requests).toHaveLength(1);
  });

  it.each([0, 101])(
    'rejects %i items locally with ERR_CLIENT_VALIDATION, sending nothing',
    async (n) => {
      const d9 = bulkCreateDocumentsHandler();
      server.use(d9.handler);
      const { result, queryClient } = renderHookWithProviders(
        () => useBulkCreateDocuments(ARTICLE),
        EDITOR,
      );
      const entries = seed(queryClient);

      const error = await act(() => result.current.mutateAsync(items(n)).catch((e: unknown) => e));

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'ERR_CLIENT_VALIDATION',
        messages: ['items must contain between 1 and 100 entries.'],
      });
      expect(d9.requests).toHaveLength(0);
      expectCacheUntouched(queryClient, entries);
    },
  );

  it.each([
    { has: ['document:publish:article'], missing: 'document:create:article' },
    { has: ['document:create:article'], missing: 'document:publish:article' },
  ])(
    'is denied without $missing: no request, no cache change (AC-25)',
    async ({ has, missing }) => {
      const d9 = bulkCreateDocumentsHandler();
      server.use(d9.handler);
      const { result, queryClient } = renderHookWithProviders(
        () => useBulkCreateDocuments(ARTICLE),
        signedIn(has),
      );
      const entries = seed(queryClient);

      const error = await act(() => result.current.mutateAsync(items(1)).catch((e: unknown) => e));

      expect(error).toMatchObject({
        status: 403,
        code: 'ERR_CLIENT_FORBIDDEN',
        message: `Requires the "${missing}" permission.`,
      });
      expect(d9.requests).toHaveLength(0);
      expectCacheUntouched(queryClient, entries);
    },
  );

  it('is denied when draftToPublish is false, sending nothing', async () => {
    const d9 = bulkCreateDocumentsHandler();
    server.use(d9.handler);
    const { result } = renderHookWithProviders(
      () => useBulkCreateDocuments(ARTICLE_MODE_B),
      EDITOR,
    );

    const error = await act(() => result.current.mutateAsync(items(1)).catch((e: unknown) => e));

    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'This content type does not use draft and publish.',
    });
    expect(d9.requests).toHaveLength(0);
  });

  it('passes a 400 rollback through unchanged and leaves the cache untouched', async () => {
    const d9 = bulkCreateDocumentsHandler(() =>
      HttpResponse.json(
        { statusCode: 400, message: ['items.1.data.title must be a string'], error: 'Bad Request' },
        { status: 400 },
      ),
    );
    server.use(d9.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkCreateDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() =>
      result.current.mutateAsync([{ title: 'ok' }, { title: 1 }]).catch((e: unknown) => e),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      messages: ['items.1.data.title must be a string'],
    });
    expect(d9.requests).toHaveLength(1);
    expectCacheUntouched(queryClient, entries);
  });
});

describe('useBulkDeleteDocuments (AC-22)', () => {
  it('sends de-duplicated documentIds, removes every deleted detail and invalidates lists(slug)', async () => {
    const d10 = bulkDeleteDocumentsHandler();
    server.use(d10.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkDeleteDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(['a', 'b', 'a']);
    });

    expect(outcome).toEqual({ deleted: ['a', 'b'], failed: [] });
    expect(d10.requests).toHaveLength(1);
    expect(d10.requests[0]).toMatchObject({ method: 'DELETE', body: { documentIds: ['a', 'b'] } });
    expect(queryClient.getQueryState(detail('a'))).toBeUndefined();
    expect(queryClient.getQueryState(detail('b'))).toBeUndefined();
    expect(queryClient.getQueryData(detail('c'))).toBe(entries.c);
    expect(invalidated(queryClient, ARTICLE_LIST)).toBe(true);
    expect(invalidated(queryClient, NEWS_LIST)).toBe(false);
  });

  it('on partial failure, resolves { deleted, failed } unchanged, removes only deleted details and still invalidates lists', async () => {
    const response: BulkDeleteResult = {
      deleted: ['a'],
      failed: [{ documentId: 'b', error: 'Document not found' }],
    };
    const d10 = bulkDeleteDocumentsHandler(() => HttpResponse.json(response));
    server.use(d10.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkDeleteDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(['a', 'b']);
    });

    expect(outcome).toEqual(response);
    expect(queryClient.getQueryState(detail('a'))).toBeUndefined();
    expect(queryClient.getQueryData(detail('b'))).toBe(entries.b);
    expect(invalidated(queryClient, detail('b'))).toBe(false);
    expect(invalidated(queryClient, ARTICLE_LIST)).toBe(true);
  });

  it('accepts 100 unique ids after removing duplicates', async () => {
    const d10 = bulkDeleteDocumentsHandler();
    server.use(d10.handler);
    const { result } = renderHookWithProviders(() => useBulkDeleteDocuments(ARTICLE), EDITOR);

    await act(async () => {
      await result.current.mutateAsync([...ids(100), 'id-1']);
    });

    expect(d10.requests).toHaveLength(1);
    expect(d10.requests[0]?.body).toEqual({ documentIds: ids(100) });
  });

  it.each([
    { label: '0 ids', input: [] as string[] },
    { label: '101 unique ids', input: ids(101) },
  ])('rejects $label locally with ERR_CLIENT_VALIDATION, sending nothing', async ({ input }) => {
    const d10 = bulkDeleteDocumentsHandler();
    server.use(d10.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkDeleteDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync(input).catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'ERR_CLIENT_VALIDATION',
      messages: ['documentIds must contain between 1 and 100 entries.'],
    });
    expect(d10.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('is denied without scoped delete: no request, no cache change (AC-25)', async () => {
    const d10 = bulkDeleteDocumentsHandler();
    server.use(d10.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkDeleteDocuments(ARTICLE),
      signedIn(['document:delete:news']),
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync(['a']).catch((e: unknown) => e));

    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'Requires the "document:delete:article" permission.',
    });
    expect(d10.requests).toHaveLength(0);
    expectCacheUntouched(queryClient, entries);
  });

  it('leaves the cache untouched on a server error', async () => {
    const d10 = bulkDeleteDocumentsHandler(errorReply(400, 'documentIds must be an array'));
    server.use(d10.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useBulkDeleteDocuments(ARTICLE),
      EDITOR,
    );
    const entries = seed(queryClient);

    const error = await act(() => result.current.mutateAsync(['a']).catch((e: unknown) => e));

    expect(error).toMatchObject({ status: 400, message: 'documentIds must be an array' });
    expectCacheUntouched(queryClient, entries);
  });
});

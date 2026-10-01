import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeContentType, makeContentTypeSummary } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  errorReply,
  getContentTypeHandler,
  getContentTypesHandler,
  patchListFieldsHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import { useContentType, useContentTypes, useUpdateListFields } from './useContentTypes';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const READER = signedIn(['content_type:read']);
const MANAGER = signedIn(['content_type:manager']);

describe('useContentTypes (AC-8)', () => {
  it('calls C1 once and returns the summaries', async () => {
    const c1 = getContentTypesHandler();
    server.use(c1.handler);

    const { result } = renderHookWithProviders(() => useContentTypes(), READER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      makeContentTypeSummary(),
      makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' }),
    ]);
    expect(result.current.decision).toEqual({ allowed: true, reason: null });
    expect(c1.requests).toHaveLength(1);
  });

  it('caches the list under contentKeys.typeList()', async () => {
    server.use(getContentTypesHandler().handler);

    const { result, queryClient } = renderHookWithProviders(() => useContentTypes(), READER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(contentKeys.typeList())).toEqual(result.current.data);
  });

  it('is disabled without content_type:read: no request, and the decision says why', async () => {
    const c1 = getContentTypesHandler();
    server.use(c1.handler);

    const { result } = renderHookWithProviders(() => useContentTypes(), signedIn([]));

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(result.current.decision).toEqual({
      allowed: false,
      reason: 'Requires the "content_type:read" permission.',
    });
    expect(c1.requests).toHaveLength(0);
  });

  it('surfaces a server 403 as an ApiError without retrying', async () => {
    const c1 = getContentTypesHandler(errorReply(403, 'Forbidden resource'));
    server.use(c1.handler);

    const { result } = renderHookWithProviders(() => useContentTypes(), READER);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(403);
    expect(c1.requests).toHaveLength(1);
  });
});

describe('useContentType (AC-9)', () => {
  it('calls C2 for the slug and returns the content type', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);

    const { result, queryClient } = renderHookWithProviders(
      () => useContentType('article'),
      READER,
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(makeContentType({ slug: 'article' }));
    expect(queryClient.getQueryData(contentKeys.type('article'))).toEqual(result.current.data);
    expect(c2.requests).toHaveLength(1);
  });

  it('is disabled for an empty slug', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);

    const { result } = renderHookWithProviders(() => useContentType(''), READER);

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(c2.requests).toHaveLength(0);
  });

  it('is disabled when read access is denied, and exposes the decision', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);

    const { result } = renderHookWithProviders(() => useContentType('article'), signedIn([]));

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.decision.allowed).toBe(false);
    expect(c2.requests).toHaveLength(0);
  });

  it('surfaces a 404 as an ApiError after exactly one request', async () => {
    const c2 = getContentTypeHandler(errorReply(404, 'Content type not found'));
    server.use(c2.handler);

    const { result } = renderHookWithProviders(() => useContentType('missing'), READER);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 404, message: 'Content type not found' });
    expect(c2.requests).toHaveLength(1);
  });
});

describe('useUpdateListFields (AC-10)', () => {
  it('PATCHes the list fields, writes type(slug) and invalidates lists(slug)', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useUpdateListFields('article'),
      MANAGER,
    );
    queryClient.setQueryData(contentKeys.type('article'), makeContentType());
    queryClient.setQueryData(contentKeys.list('article', {}), { items: [] });
    queryClient.setQueryData(contentKeys.list('news', {}), { items: [] });

    let updated: unknown;
    await act(async () => {
      updated = await result.current.mutateAsync(['id', 'title']);
    });

    const expected = makeContentType({ slug: 'article', listFields: ['id', 'title'] });
    expect(updated).toEqual(expected);
    expect(c3.requests).toHaveLength(1);
    expect(c3.requests[0]?.body).toEqual({ listFields: ['id', 'title'] });
    expect(queryClient.getQueryData(contentKeys.type('article'))).toEqual(expected);
    expect(queryClient.getQueryState(contentKeys.list('article', {}))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(contentKeys.list('news', {}))?.isInvalidated).toBe(false);
  });

  it('rejects with ERR_CLIENT_FORBIDDEN without content_type:manager, sending nothing', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useUpdateListFields('article'),
      READER,
    );
    const before = makeContentType();
    queryClient.setQueryData(contentKeys.type('article'), before);

    const error = await act(() => result.current.mutateAsync(['title']).catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'Requires the "content_type:manager" permission.',
    });
    expect(c3.requests).toHaveLength(0);
    expect(queryClient.getQueryData(contentKeys.type('article'))).toBe(before);
  });

  it('rejects an empty listFields with ERR_CLIENT_VALIDATION, sending nothing', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { result } = renderHookWithProviders(() => useUpdateListFields('article'), MANAGER);

    const error = await act(() => result.current.mutateAsync([]).catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'ERR_CLIENT_VALIDATION' });
    expect((error as ApiError).messages).toEqual(['listFields must not be empty.']);
    expect(c3.requests).toHaveLength(0);
  });

  it.each([400, 403])('leaves the cache untouched on a server %i', async (status) => {
    const c3 = patchListFieldsHandler(errorReply(status, 'Rejected'));
    server.use(c3.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useUpdateListFields('article'),
      MANAGER,
    );
    const before = makeContentType();
    queryClient.setQueryData(contentKeys.type('article'), before);
    queryClient.setQueryData(contentKeys.list('article', {}), { items: [] });

    const error = await act(() => result.current.mutateAsync(['body']).catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message: 'Rejected' });
    expect(c3.requests).toHaveLength(1);
    expect(queryClient.getQueryData(contentKeys.type('article'))).toBe(before);
    expect(queryClient.getQueryState(contentKeys.list('article', {}))?.isInvalidated).toBe(false);
  });
});

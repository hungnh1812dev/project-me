import { act, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeDocument } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  errorReply,
  getSingleTypeHandler,
  publishSingleTypeHandler,
  saveSingleTypeHandler,
  unpublishSingleTypeHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import type { ContentTypeRef } from '../types';
import {
  usePublishSingleType,
  useSaveSingleType,
  useSingleTypeDocument,
  useUnpublishSingleType,
} from './useSingleType';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const HOME: ContentTypeRef = { slug: 'home', draftToPublish: true };
const HOME_MODE_B: ContentTypeRef = { slug: 'home', draftToPublish: false };
const EDITOR = signedIn([
  'document:read:home',
  'document:update:home',
  'document:publish:home',
  'document:unpublish:home',
]);

describe('useSingleTypeDocument (AC-11)', () => {
  it('calls S1 and resolves with the unwrapped document under single(slug)', async () => {
    const s1 = getSingleTypeHandler();
    server.use(s1.handler);

    const { result, queryClient } = renderHookWithProviders(
      () => useSingleTypeDocument(HOME),
      EDITOR,
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(makeDocument());
    expect(queryClient.getQueryData(contentKeys.single('home'))).toEqual(makeDocument());
    expect(s1.requests).toHaveLength(1);
    expect(s1.requests[0]?.url.pathname).toBe('/api/v1/documents/single-type/home');
  });

  it('resolves null on a 404 (never saved) after exactly one request', async () => {
    const s1 = getSingleTypeHandler(errorReply(404, 'Not found'));
    server.use(s1.handler);

    const { result } = renderHookWithProviders(() => useSingleTypeDocument(HOME), EDITOR);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(s1.requests).toHaveLength(1);
  });

  it('propagates any other error as an ApiError', async () => {
    const s1 = getSingleTypeHandler(errorReply(403, 'Forbidden resource'));
    server.use(s1.handler);

    const { result } = renderHookWithProviders(() => useSingleTypeDocument(HOME), EDITOR);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.status).toBe(403);
    expect(s1.requests).toHaveLength(1);
  });

  it('is disabled when scoped read is denied', async () => {
    const s1 = getSingleTypeHandler();
    server.use(s1.handler);

    const { result } = renderHookWithProviders(
      () => useSingleTypeDocument(HOME),
      signedIn(['document:read:about']),
    );

    await act(() => Promise.resolve());
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(s1.requests).toHaveLength(0);
  });
});

describe('useSaveSingleType (AC-12)', () => {
  it('PUTs { data }, resolves the document and writes single(slug)', async () => {
    const s2 = saveSingleTypeHandler();
    server.use(s2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useSaveSingleType(HOME), EDITOR);

    let saved: unknown;
    await act(async () => {
      saved = await result.current.mutateAsync({ title: 'Welcome' });
    });

    const expected = makeDocument({ title: 'Welcome' });
    expect(saved).toEqual(expected);
    expect(s2.requests).toHaveLength(1);
    expect(s2.requests[0]).toMatchObject({ method: 'PUT', body: { data: { title: 'Welcome' } } });
    expect(queryClient.getQueryData(contentKeys.single('home'))).toEqual(expected);
  });

  it('rejects with ERR_CLIENT_FORBIDDEN without scoped update, sending nothing', async () => {
    const s2 = saveSingleTypeHandler();
    server.use(s2.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useSaveSingleType(HOME),
      signedIn(['document:update:about']),
    );
    const before = makeDocument();
    queryClient.setQueryData(contentKeys.single('home'), before);

    const error = await act(() =>
      result.current.mutateAsync({ title: 'x' }).catch((e: unknown) => e),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'Requires the "document:update:home" permission.',
    });
    expect(s2.requests).toHaveLength(0);
    expect(queryClient.getQueryData(contentKeys.single('home'))).toBe(before);
  });

  it('leaves the cache untouched on a server error', async () => {
    const s2 = saveSingleTypeHandler(errorReply(400, 'title must be a string'));
    server.use(s2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useSaveSingleType(HOME), EDITOR);
    const before = makeDocument();
    queryClient.setQueryData(contentKeys.single('home'), before);

    const error = await act(() =>
      result.current.mutateAsync({ title: 1 }).catch((e: unknown) => e),
    );

    expect(error).toMatchObject({ status: 400, message: 'title must be a string' });
    expect(queryClient.getQueryData(contentKeys.single('home'))).toBe(before);
  });
});

describe.each([
  {
    name: 'usePublishSingleType',
    useHook: usePublishSingleType,
    handler: publishSingleTypeHandler,
    action: 'publish',
    status: 'published',
  },
  {
    name: 'useUnpublishSingleType',
    useHook: useUnpublishSingleType,
    handler: unpublishSingleTypeHandler,
    action: 'unpublish',
    status: 'draft',
  },
] as const)('$name (AC-13)', ({ useHook, handler, action, status }) => {
  it(`POSTs /${action}, returns the PublishResult and invalidates single(slug)`, async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(() => useHook(HOME), EDITOR);
    queryClient.setQueryData(contentKeys.single('home'), makeDocument());
    queryClient.setQueryData(contentKeys.single('about'), makeDocument());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });

    expect(outcome).toEqual({ status });
    expect(recorder.requests).toHaveLength(1);
    expect(recorder.requests[0]?.url.pathname).toBe(`/api/v1/documents/single-type/home/${action}`);
    expect(queryClient.getQueryState(contentKeys.single('home'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(contentKeys.single('about'))?.isInvalidated).toBe(false);
  });

  it(`is denied without the scoped ${action} permission, sending nothing`, async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(
      () => useHook(HOME),
      signedIn([`document:${action}:about`]),
    );
    queryClient.setQueryData(contentKeys.single('home'), makeDocument());

    const error = await act(() => result.current.mutateAsync().catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: `Requires the "document:${action}:home" permission.`,
    });
    expect(recorder.requests).toHaveLength(0);
    expect(queryClient.getQueryState(contentKeys.single('home'))?.isInvalidated).toBe(false);
  });

  it('is denied when draftToPublish is false, sending nothing', async () => {
    const recorder = handler();
    server.use(recorder.handler);
    const { result } = renderHookWithProviders(() => useHook(HOME_MODE_B), EDITOR);

    const error = await act(() => result.current.mutateAsync().catch((e: unknown) => e));

    expect(error).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'This content type does not use draft and publish.',
    });
    expect(recorder.requests).toHaveLength(0);
  });

  it('leaves the cache untouched on a server error', async () => {
    const recorder = handler(() =>
      HttpResponse.json({ statusCode: 409, message: 'Not saved yet' }, { status: 409 }),
    );
    server.use(recorder.handler);
    const { result, queryClient } = renderHookWithProviders(() => useHook(HOME), EDITOR);
    queryClient.setQueryData(contentKeys.single('home'), makeDocument());

    const error = await act(() => result.current.mutateAsync().catch((e: unknown) => e));

    expect(error).toMatchObject({ status: 409, message: 'Not saved yet' });
    expect(queryClient.getQueryState(contentKeys.single('home'))?.isInvalidated).toBe(false);
  });
});

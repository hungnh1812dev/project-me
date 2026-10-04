import { act, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  errorReply,
  publishDocumentHandler,
  unpublishDocumentHandler,
  type RecordedRequest,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { contentKeys } from '../queryKeys';
import type { ContentTypeRef, DocumentStatus } from '../types';
import { useBulkStatus, type BulkStatusResult } from './useBulkStatus';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  };
}

const ARTICLE: ContentTypeRef = { slug: 'article', draftToPublish: true };
const EDITOR = signedIn(['document:publish:article', 'document:unpublish:article']);

const rows = (...statuses: [string, DocumentStatus][]) =>
  statuses.map(([documentId, status]) => ({ documentId, status }));

describe('useBulkStatus (AC-31)', () => {
  it('publishes one entry at a time, skipping the published ones, and reports the outcome', async () => {
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { result } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);

    let outcome: BulkStatusResult | undefined;
    await act(async () => {
      outcome = await result.current.run(
        'publish',
        rows(['a', 'draft'], ['b', 'published'], ['c', 'modified']),
      );
    });

    expect(d6.requests.map((r) => r.params.documentId)).toEqual(['a', 'c']);
    expect(outcome).toEqual({
      target: 'publish',
      succeeded: ['a', 'c'],
      failed: [],
      skipped: ['b'],
    });
    expect(result.current.progress).toBeNull();
    expect(result.current.running).toBe(false);
  });

  it('unpublishes only entries that are not drafts', async () => {
    const d7 = unpublishDocumentHandler();
    server.use(d7.handler);
    const { result } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);

    let outcome: BulkStatusResult | undefined;
    await act(async () => {
      outcome = await result.current.run('unpublish', rows(['a', 'draft'], ['b', 'published']));
    });

    expect(d7.requests.map((r) => r.params.documentId)).toEqual(['b']);
    expect(outcome?.skipped).toEqual(['a']);
  });

  it('sends the next request only after the previous one finished', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const d6 = publishDocumentHandler(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return HttpResponse.json({ status: 'published' });
    });
    server.use(d6.handler);
    const { result } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);

    await act(() =>
      result.current.run('publish', rows(['a', 'draft'], ['b', 'draft'], ['c', 'draft'])),
    );

    expect(d6.requests).toHaveLength(3);
    expect(maxInFlight).toBe(1);
  });

  it('reports progress while it runs', async () => {
    const release: (() => void)[] = [];
    const d6 = publishDocumentHandler(
      () =>
        new Promise<Response>((resolve) => {
          release.push(() => resolve(HttpResponse.json({ status: 'published' })));
        }),
    );
    server.use(d6.handler);
    const { result } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);

    let done: Promise<BulkStatusResult> | undefined;
    act(() => {
      done = result.current.run('publish', rows(['a', 'draft'], ['b', 'draft']));
    });

    await waitFor(() => expect(release).toHaveLength(1));
    expect(result.current.progress).toEqual({ target: 'publish', current: 1, total: 2 });
    expect(result.current.running).toBe(true);
    act(() => release[0]!());

    await waitFor(() => expect(release).toHaveLength(2));
    expect(result.current.progress).toEqual({ target: 'publish', current: 2, total: 2 });
    act(() => release[1]!());

    await act(async () => {
      await done;
    });
    expect(result.current.progress).toBeNull();
  });

  it('carries on after a failure and reports it with its error', async () => {
    const reply = (request: RecordedRequest) =>
      request.params.documentId === 'b'
        ? errorReply(403, 'Forbidden resource')(request)
        : HttpResponse.json({ status: 'published' });
    const d6 = publishDocumentHandler(reply);
    server.use(d6.handler);
    const { result } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);

    let outcome: BulkStatusResult | undefined;
    await act(async () => {
      outcome = await result.current.run(
        'publish',
        rows(['a', 'draft'], ['b', 'draft'], ['c', 'draft']),
      );
    });

    expect(d6.requests).toHaveLength(3);
    expect(outcome?.succeeded).toEqual(['a', 'c']);
    expect(outcome?.failed).toHaveLength(1);
    expect(outcome?.failed[0]!.documentId).toBe('b');
    expect(outcome?.failed[0]!.error).toMatchObject({ status: 403 });
  });

  it('invalidates the lists once, at the end', async () => {
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { result, queryClient } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);
    queryClient.setQueryData(contentKeys.list('article', {}), makeListResponse());
    queryClient.setQueryData(contentKeys.list('news', {}), makeListResponse());
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.run('publish', rows(['a', 'draft'], ['b', 'draft'])));

    const listCalls = spy.mock.calls.filter(
      ([filters]) =>
        JSON.stringify(filters?.queryKey) === JSON.stringify(contentKeys.lists('article')),
    );
    expect(listCalls).toHaveLength(1);
    expect(queryClient.getQueryState(contentKeys.list('article', {}))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(contentKeys.list('news', {}))?.isInvalidated).toBe(false);
  });

  it('does not invalidate anything when every entry was skipped', async () => {
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { result, queryClient } = renderHookWithProviders(() => useBulkStatus(ARTICLE), EDITOR);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current.run('publish', rows(['a', 'published'])));

    expect(d6.requests).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    [
      'publish' as const,
      ARTICLE,
      ['document:unpublish:article'],
      'Requires the "document:publish:article" permission.',
    ],
    [
      'unpublish' as const,
      { slug: 'article', draftToPublish: false },
      ['document:publish:article', 'document:unpublish:article'],
      'This content type does not use draft and publish.',
    ],
  ])(
    'a denied %s rejects with ERR_CLIENT_FORBIDDEN and sends nothing',
    async (target, ref, permissions, message) => {
      const d6 = publishDocumentHandler();
      const d7 = unpublishDocumentHandler();
      server.use(d6.handler, d7.handler);
      const { result } = renderHookWithProviders(() => useBulkStatus(ref), signedIn(permissions));

      const error = await act(() =>
        result.current.run(target, rows(['a', 'modified'])).catch((e: unknown) => e),
      );

      expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message });
      expect(d6.requests).toHaveLength(0);
      expect(d7.requests).toHaveLength(0);
      expect(result.current.running).toBe(false);
    },
  );
});

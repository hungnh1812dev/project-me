import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeQueryClient } from '@/app/queryClient';
import { contentKeys } from '@/features/content/queryKeys';
import { makeContentType, makeDocument } from '@/test/contentFixtures';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { useBreadcrumbs } from './useBreadcrumbs';

const DETAIL = '/admin/content-types/article/doc-1';

describe('useBreadcrumbs (AC-39)', () => {
  it('shows "New entry" on the create page', () => {
    const { result } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: '/admin/content-types/article/new',
    });

    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Home',
      'Content types',
      'article',
      'New entry',
    ]);
  });

  it('shows the documentId while nothing is cached, without fetching', () => {
    const { result, queryClient } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: DETAIL,
    });

    expect(result.current.at(-1)).toEqual({ label: 'doc-1' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.isFetching()).toBe(0);
  });

  it('labels the entry from the cached content type and document', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(contentKeys.type('article'), makeContentType());
    queryClient.setQueryData(
      contentKeys.detail('article', 'doc-1'),
      makeDocument({ title: 'Hello world' }),
    );

    const { result } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: DETAIL,
      queryClient,
    });

    expect(result.current.slice(2)).toEqual([
      { label: 'Article', to: '/admin/content-types/article' },
      { label: 'Hello world' },
    ]);
  });

  it('says "Untitled entry" when the document has no text value', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(contentKeys.type('article'), makeContentType());
    queryClient.setQueryData(contentKeys.detail('article', 'doc-1'), makeDocument({ title: '' }));

    const { result } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: DETAIL,
      queryClient,
    });

    expect(result.current.at(-1)).toEqual({ label: 'Untitled entry' });
  });

  it('keeps the documentId while only the document is cached', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(contentKeys.detail('article', 'doc-1'), makeDocument());

    const { result } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: DETAIL,
      queryClient,
    });

    expect(result.current.at(-1)).toEqual({ label: 'doc-1' });
  });

  it('follows a later cache write, such as a save', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(contentKeys.type('article'), makeContentType());
    const { result } = renderHookWithProviders(() => useBreadcrumbs(), {
      route: DETAIL,
      queryClient,
    });

    act(() => {
      queryClient.setQueryData(
        contentKeys.detail('article', 'doc-1'),
        makeDocument({ title: 'Renamed' }),
      );
    });

    expect(result.current.at(-1)).toEqual({ label: 'Renamed' });
  });
});

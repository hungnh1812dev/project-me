import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { clampPage, pageSlice } from '@repo/ui/lib/pagination';

import { parsePaging, serializePaging, type PageSize } from '../paging';

export interface ListPaging<T> {
  /** The page shown, 1-based and clamped to the list once it has loaded. */
  page: number;
  size: PageSize;
  /** The number of items paged over (after the search), 0 while loading. */
  total: number;
  /** The items on `page`. */
  rows: T[];
  /** Pushes a history entry, so Back returns to the previous page. */
  onPageChange: (page: number) => void;
  /** Pushes a history entry and goes back to page 1. */
  onSizeChange: (size: number) => void;
}

/**
 * Client-side paging of a settings list (D5, D6) with `page` and `size` in the URL (AC-24).
 * `items` is the sorted, searched list, `undefined` while it loads. Invalid values, a page past
 * the end (after a deep link or a delete, AC-26) and a changed `search` (AC-25, page 1) are fixed
 * with `replace`, so they add no history entry. The rows always come from a valid page, so an
 * empty page never shows while items remain.
 */
export function useListPaging<T>(items: readonly T[] | undefined, search: string): ListPaging<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const paging = useMemo(() => parsePaging(searchParams), [searchParams]);
  const total = items?.length;
  const page = total === undefined ? paging.page : clampPage(paging.page, total, paging.size);

  const lastSearch = useRef(search);
  useEffect(() => {
    const searchChanged = lastSearch.current !== search;
    lastSearch.current = search;
    const next = serializePaging(
      { page: searchChanged ? 1 : page, size: paging.size },
      searchParams,
    );
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [search, page, paging.size, searchParams, setSearchParams]);

  const onPageChange = useCallback(
    (next: number) =>
      setSearchParams(serializePaging({ page: next, size: paging.size }, searchParams)),
    [paging.size, searchParams, setSearchParams],
  );
  const onSizeChange = useCallback(
    (size: number) =>
      // `Pagination` only offers PAGE_SIZES; any other value falls back when the URL is parsed.
      setSearchParams(serializePaging({ page: 1, size: size as PageSize }, searchParams)),
    [searchParams, setSearchParams],
  );

  const rows = useMemo(() => pageSlice(items ?? [], page, paging.size), [items, page, paging.size]);
  return { page, size: paging.size, total: total ?? 0, rows, onPageChange, onSizeChange };
}

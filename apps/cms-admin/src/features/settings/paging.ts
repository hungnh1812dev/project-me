/** The page sizes every settings list offers (D6). Any other `size` in the URL falls back. */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

/** A settings list's page and size, as the URL holds them (AC-24). `page` is 1-based. */
export interface Paging {
  page: number;
  size: PageSize;
}

export const DEFAULT_PAGING: Paging = { page: 1, size: 10 };

/** A page of at most nine digits keeps the slice start a safe integer for every page size. */
const PAGE = /^[1-9]\d{0,8}$/;

const isPageSize = (value: number): value is PageSize =>
  (PAGE_SIZES as readonly number[]).includes(value);

/**
 * Reads `page` and `size` from a query (AC-24). A missing or invalid value falls back to its
 * default, and the first of a repeated param wins. A page past the end is clamped later, once the
 * list's length is known.
 */
export function parsePaging(search: string | URLSearchParams): Paging {
  const query = typeof search === 'string' ? new URLSearchParams(search) : search;
  const page = query.get('page') ?? '';
  const size = Number(query.get('size') ?? '');
  return {
    page: PAGE.test(page) ? Number(page) : DEFAULT_PAGING.page,
    size: isPageSize(size) ? size : DEFAULT_PAGING.size,
  };
}

/**
 * A copy of `base` with `page` and `size` set from `paging`, each left out at its default (AC-24).
 * Every other param is kept.
 */
export function serializePaging(
  paging: Paging,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const query = new URLSearchParams(base);
  // `set` keeps the first occurrence's position and drops repeats, so a canonical URL is unchanged.
  if (paging.page === DEFAULT_PAGING.page) query.delete('page');
  else query.set('page', String(paging.page));
  if (paging.size === DEFAULT_PAGING.size) query.delete('size');
  else query.set('size', String(paging.size));
  return query;
}

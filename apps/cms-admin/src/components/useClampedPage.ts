import type { PageMeta } from '../lib/Api.client';

/**
 * The last row of a page can go away (removed elsewhere); step back so the
 * user never sits on an empty page past the end. The page state lives in the
 * caller because the query needs it before `meta` exists. Returns the last
 * page number.
 */
export function useClampedPage(
  page: number,
  setPage: (page: number) => void,
  meta: PageMeta | undefined,
): number {
  const lastPage = meta
    ? Math.max(1, Math.ceil(meta.total / meta.pageSize))
    : 1;
  if (page > lastPage) setPage(lastPage); // adjust during render, not in an effect
  return lastPage;
}

/** The last 1-based page of `total` items, `size` per page. An empty list has one page. */
export function lastPage(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** `page` moved into `1..lastPage(total, size)`. */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(page, 1), lastPage(total, size));
}

/** The items on 1-based `page`, `size` per page. A page past the end is empty; clamp it first. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

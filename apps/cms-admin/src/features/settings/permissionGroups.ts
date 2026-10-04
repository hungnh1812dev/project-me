interface HasSlug {
  slug: string;
}

/** A resource's rows on the current page, and how many rows match in the whole list. */
export interface ResourceGroup<T extends HasSlug> {
  resource: string;
  permissions: T[];
  /** The group's full match count, the same on every page it appears on (Phase 6 AC-22). */
  total: number;
}

/** A copy sorted by slug (AC-24). */
export const sortBySlug = <T extends HasSlug>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.slug.localeCompare(b.slug));

/** The resource of a slug: the part before the first `:`, or the whole slug. */
const resourceOf = (slug: string) => slug.split(':')[0] ?? slug;

/**
 * Groups one page of slug-sorted rows by resource, in row order (AC-24). A group split across pages
 * appears on each of them, and `total` counts its rows in `all`, the full sorted match list
 * (Phase 6 AC-22).
 */
export function groupByResource<T extends HasSlug>(
  page: readonly T[],
  all: readonly T[],
): ResourceGroup<T>[] {
  const totals = new Map<string, number>();
  for (const item of all) {
    const resource = resourceOf(item.slug);
    totals.set(resource, (totals.get(resource) ?? 0) + 1);
  }
  const groups = new Map<string, T[]>();
  for (const item of page) {
    const resource = resourceOf(item.slug);
    groups.set(resource, [...(groups.get(resource) ?? []), item]);
  }
  return [...groups].map(([resource, permissions]) => ({
    resource,
    permissions,
    total: totals.get(resource) ?? permissions.length,
  }));
}

/**
 * Keeps the items where any of `fields` contains `query`, ignoring case and surrounding spaces
 * (AC-4). An empty query keeps every item. `null` and missing values never match; numbers match as
 * text. Pure: the input is not changed.
 */
export function filterBySearch<T>(
  items: readonly T[],
  query: string,
  fields: readonly (keyof T)[],
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      return value != null && String(value).toLowerCase().includes(needle);
    }),
  );
}

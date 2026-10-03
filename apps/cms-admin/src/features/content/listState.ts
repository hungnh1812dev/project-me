import type { Column, ColumnCatalog } from './columns';
import { LIST_DEFAULTS, MAX_LIST_TEXT_LENGTH, normalizeListParams } from './listQuery';
import type { FilterOperator, ListFilters, ListParams, SortDir } from './types';

/** The page sizes the list offers. Any other `size` in the URL falls back to the default. */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

/** One active filter: a single operator and its value, as it appears in the URL. */
export interface ListFilter {
  op: FilterOperator;
  value: string;
}

/** The collection list's state. The URL holds it (SPEC "URL state"); this is its parsed form. */
export interface ListState {
  /** 1-based. */
  page: number;
  size: PageSize;
  orderBy: string;
  sortDir: SortDir;
  /** The search text, trimmed. Empty means no search. */
  q: string;
  /** At most one operator per field, keyed by the camelCase column name. */
  filters: Record<string, ListFilter>;
}

export const DEFAULT_LIST_STATE: ListState = {
  page: 1,
  size: LIST_DEFAULTS.size,
  orderBy: LIST_DEFAULTS.orderBy,
  sortDir: LIST_DEFAULTS.sortDir,
  q: '',
  filters: {},
};

/** The result of `parseListState`: a valid state, and the column params it had to drop (D8). */
export interface ParsedListState {
  state: ListState;
  /**
   * The raw keys of the ignored `orderBy`, `q` and `filters[…][…]` params, in URL order. Bad
   * `page`, `size` and `sortDir` values and unrelated params are fixed silently and not listed.
   */
  dropped: string[];
}

/** A page of at most nine digits keeps `start` a safe integer for every page size. */
const PAGE = /^[1-9]\d{0,8}$/;
const FILTER_KEY = /^filters\[([^[\]]+)\]\[([^[\]]+)\]$/;

const isPageSize = (value: number): value is PageSize =>
  (PAGE_SIZES as readonly number[]).includes(value);

const isNumeric = (value: string) => Number.isFinite(Number(value));

/** Whether `value` is a well-formed filter value for `column`'s kind. */
function validValue(column: Column, value: string): boolean {
  if (value === '' || value.length > MAX_LIST_TEXT_LENGTH) return false;
  switch (column.kind) {
    case 'number':
      return isNumeric(value);
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'date':
      return !Number.isNaN(Date.parse(value));
    default:
      return true;
  }
}

/**
 * Parses a list URL's query into a valid `ListState` (AC-3). Every param is checked against the
 * content type's column catalog: an `orderBy` that isn't sortable, a filter on a column that isn't
 * filterable, an operator the column doesn't allow, a malformed value, a second operator on a field
 * and a search over 256 characters are dropped and listed in `dropped` (D8). The first occurrence of
 * a repeated param wins.
 */
export function parseListState(
  search: string | URLSearchParams,
  catalog: ColumnCatalog,
): ParsedListState {
  const query = typeof search === 'string' ? new URLSearchParams(search) : search;
  const state: ListState = { ...DEFAULT_LIST_STATE, filters: {} };
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const [key, raw] of query) {
    const match = FILTER_KEY.exec(key);
    if (match) {
      const [, field, op] = match as unknown as [string, string, string];
      const column = catalog.byKey.get(field);
      const value = raw.trim();
      const ok =
        column !== undefined &&
        column.operators.includes(op as FilterOperator) &&
        !Object.hasOwn(state.filters, field) &&
        validValue(column, value);
      if (ok) state.filters[field] = { op: op as FilterOperator, value };
      else dropped.push(key);
      continue;
    }
    if (key.startsWith('filters')) {
      dropped.push(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    switch (key) {
      case 'page':
        if (PAGE.test(raw)) state.page = Number(raw);
        break;
      case 'size': {
        const size = Number(raw);
        if (isPageSize(size)) state.size = size;
        break;
      }
      case 'sortDir':
        if (raw === 'asc' || raw === 'desc') state.sortDir = raw;
        break;
      case 'orderBy':
        if (catalog.byKey.get(raw)?.sortable) state.orderBy = raw;
        else dropped.push(key);
        break;
      case 'q': {
        const q = raw.trim();
        if (q.length <= MAX_LIST_TEXT_LENGTH) state.q = q;
        else dropped.push(key);
        break;
      }
    }
  }
  return { state, dropped };
}

/** A filter key with readable brackets and `$`, which browsers leave as they are in a query. */
const filterKey = (field: string, op: string) =>
  `filters[${encodeURIComponent(field)}][${encodeURIComponent(op).replace('%24', '$')}]`;

/**
 * The canonical query string of `state`, without the leading `?` (AC-3): defaults and a blank
 * search are dropped, and the keys are sorted, so equal states give the same string.
 */
export function serializeListState(state: ListState): string {
  const entries: [string, string][] = [];
  if (state.page !== DEFAULT_LIST_STATE.page) entries.push(['page', String(state.page)]);
  if (state.size !== DEFAULT_LIST_STATE.size) entries.push(['size', String(state.size)]);
  if (state.orderBy !== DEFAULT_LIST_STATE.orderBy) entries.push(['orderBy', state.orderBy]);
  if (state.sortDir !== DEFAULT_LIST_STATE.sortDir) entries.push(['sortDir', state.sortDir]);
  const q = state.q.trim();
  if (q) entries.push(['q', q]);
  for (const [field, { op, value }] of Object.entries(state.filters)) {
    entries.push([filterKey(field, op), value]);
  }
  return entries
    .sort(([a], [b]) => (a < b ? -1 : 1)) // keys are unique
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

/** The last 1-based page of `total` items, `size` per page. An empty list has one page. */
export function lastPage(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The D1 list params of `state`, normalized: `start = (page - 1) * size`. */
export function toListParams(state: ListState): ListParams {
  const filters: ListFilters = {};
  for (const [field, { op, value }] of Object.entries(state.filters)) {
    filters[field] = { [op]: value };
  }
  return normalizeListParams({
    start: (state.page - 1) * state.size,
    size: state.size,
    orderBy: state.orderBy,
    sortDir: state.sortDir,
    search: state.q,
    filters,
  });
}

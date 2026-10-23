import { z } from 'zod';

import {
  invalidRequest,
  parseRequest,
  queryInt,
} from '../../../common/http/request-parsing';
import { PAGINATION } from '../../../common/http/request-parsing';
import { CONTENT_STATUSES } from '../../content-engine/content-engine.constants';
import {
  DEFAULT_DOCUMENT_STATUS,
  DOCUMENT_QUERY_KEYS,
  DOCUMENT_QUERY_LIMITS,
  FILTER_DEFAULT_OPERATOR,
  FILTER_KEY_PATTERN,
  FILTER_KEY_PREFIX,
  FILTER_OPERATORS,
  type FilterOperator,
  SORT_DEFAULT,
  SORT_DESCENDING_PREFIX,
  SORT_SEPARATOR,
} from '../documents.constants';

type ContentStatus = (typeof CONTENT_STATUSES)[number];

export type SortDirection = 'asc' | 'desc';

export interface SortKey {
  path: string;
  direction: SortDirection;
}

/** One `filter[...]` parameter; values are still the raw strings of the URL. */
export interface FilterClause {
  path: string;
  op: FilterOperator;
  values: string[];
}

export interface ListDocumentsQuery {
  status: ContentStatus;
  page: number;
  pageSize: number;
  sort: SortKey[];
  filters: FilterClause[];
}

const FIELD_PATH_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;

const paramsSchema = z.strictObject({
  [DOCUMENT_QUERY_KEYS.STATUS]: z
    .enum(CONTENT_STATUSES)
    .optional()
    .transform((value): ContentStatus => value ?? DEFAULT_DOCUMENT_STATUS),
  [DOCUMENT_QUERY_KEYS.PAGE]: queryInt(
    PAGINATION.FIRST_PAGE,
    DOCUMENT_QUERY_LIMITS.MAX_PAGE,
    PAGINATION.FIRST_PAGE,
  ),
  [DOCUMENT_QUERY_KEYS.PAGE_SIZE]: queryInt(
    1,
    PAGINATION.MAX_PAGE_SIZE,
    PAGINATION.DEFAULT_PAGE_SIZE,
  ),
  [DOCUMENT_QUERY_KEYS.SORT]: z
    .string()
    .max(DOCUMENT_QUERY_LIMITS.MAX_SORT_LENGTH)
    .optional(),
});

const isOperator = (op: string): op is FilterOperator =>
  (FILTER_OPERATORS as readonly string[]).includes(op);

function badFilter(message: string): never {
  throw invalidRequest([{ path: ['filter'], message }]);
}

function parseSort(raw: string | undefined): SortKey[] {
  if (raw === undefined) return SORT_DEFAULT.map((key) => ({ ...key }));
  const keys = raw.split(SORT_SEPARATOR).map((part): SortKey => {
    const descending = part.startsWith(SORT_DESCENDING_PREFIX);
    const path = descending ? part.slice(SORT_DESCENDING_PREFIX.length) : part;
    if (!FIELD_PATH_PATTERN.test(path)) {
      throw invalidRequest([
        { path: [DOCUMENT_QUERY_KEYS.SORT], message: 'Invalid sort key.' },
      ]);
    }
    return { path, direction: descending ? 'desc' : 'asc' };
  });
  if (
    keys.length > DOCUMENT_QUERY_LIMITS.MAX_SORT_KEYS ||
    new Set(keys.map((key) => key.path)).size !== keys.length
  ) {
    throw invalidRequest([
      {
        path: [DOCUMENT_QUERY_KEYS.SORT],
        message: `At most ${DOCUMENT_QUERY_LIMITS.MAX_SORT_KEYS} different sort keys.`,
      },
    ]);
  }
  return keys;
}

function parseFilter(key: string, raw: unknown): FilterClause {
  const match = FILTER_KEY_PATTERN.exec(key);
  const path = match?.[1];
  const op = match?.[2] ?? FILTER_DEFAULT_OPERATOR;
  if (path === undefined || !FIELD_PATH_PATTERN.test(path)) {
    return badFilter('Malformed filter parameter.');
  }
  if (!isOperator(op)) return badFilter('Unknown filter operator.');
  const values = Array.isArray(raw) ? raw : [raw];
  if (
    !values.every((value): value is string => typeof value === 'string') ||
    values.length === 0 ||
    (op !== 'in' && values.length !== 1) ||
    values.length > DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES ||
    values.some(
      (value) => value.length > DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH,
    )
  ) {
    return badFilter('Invalid filter value.');
  }
  return { path, op, values };
}

/**
 * Parses the query string of `GET /documents/:slug`. Express 5 hands over a
 * flat map (`filter[title][contains]` is one key), so filters are matched by
 * key. Anything unknown or malformed is a 400 that names the parameter kind,
 * never the submitted value.
 */
export function parseListQuery(query: unknown): ListDocumentsQuery {
  const entries =
    typeof query === 'object' && query !== null ? Object.entries(query) : [];
  const filterEntries = entries.filter(([key]) =>
    key.startsWith(FILTER_KEY_PREFIX),
  );
  const rest = Object.fromEntries(
    entries.filter(([key]) => !key.startsWith(FILTER_KEY_PREFIX)),
  );
  const params = parseRequest(paramsSchema, rest);
  if (filterEntries.length > DOCUMENT_QUERY_LIMITS.MAX_FILTERS) {
    badFilter(`At most ${DOCUMENT_QUERY_LIMITS.MAX_FILTERS} filters.`);
  }
  return {
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
    sort: parseSort(params.sort),
    filters: filterEntries.map(([key, value]) => parseFilter(key, value)),
  };
}

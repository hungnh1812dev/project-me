import {
  invalidRequest,
  type RequestIssue,
} from '../access/access-management.requests';
import { PAGINATION } from '../access/access-management.constants';
import {
  DOCUMENT_QUERY_KEYS,
  DOCUMENT_QUERY_LIMITS,
  SORT_DEFAULT,
} from '../documents/documents.constants';
import type {
  FilterClause,
  ListDocumentsQuery,
  SortKey,
} from '../documents/dto/list-documents.query';
import type { CONTENT_STATUSES } from '../content-engine/content-engine.constants';
import { GRAPHQL_MESSAGES } from './graphql.constants';
import { filterToClauses, sortToKeys } from './schema/filter-inputs';

/** The arguments of a `<x>List` root field, as graphql-js coerced them. */
type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface ListArguments {
  status: ContentStatus;
  page: number;
  pageSize: number;
  sort?: readonly { field: string; direction?: 'asc' | 'desc' | null }[] | null;
  filter?: Readonly<Record<string, unknown>> | null;
}

const FILTER_PATH = ['filter'];

function reject(path: readonly string[], message: string): never {
  const issue: RequestIssue = { path, message };
  throw invalidRequest([issue]);
}

function checkFilters(clauses: readonly FilterClause[]): void {
  if (clauses.length > DOCUMENT_QUERY_LIMITS.MAX_FILTERS) {
    reject(FILTER_PATH, GRAPHQL_MESSAGES.FILTER_TOO_MANY);
  }
  for (const { op, values } of clauses) {
    const tooMany =
      values.length === 0 ||
      (op !== 'in' && values.length !== 1) ||
      values.length > DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES;
    const tooLong = values.some(
      (value) => value.length > DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH,
    );
    if (tooMany || tooLong)
      reject(FILTER_PATH, GRAPHQL_MESSAGES.FILTER_BAD_VALUE);
  }
}

function checkSort(keys: readonly SortKey[]): void {
  if (
    keys.length > DOCUMENT_QUERY_LIMITS.MAX_SORT_KEYS ||
    new Set(keys.map((key) => key.path)).size !== keys.length
  ) {
    reject(
      [DOCUMENT_QUERY_KEYS.SORT],
      GRAPHQL_MESSAGES.SORT_DUPLICATE_OR_TOO_MANY,
    );
  }
}

/**
 * The REST `ListDocumentsQuery` of a list field: the same ranges and limits
 * as `parseListQuery` (page, pageSize, sort keys, filter count and values),
 * the default sort when none is given, values stringified. Messages never
 * contain a submitted value. Field names and operators were already checked
 * by the schema; `QueryGuard` and the filter compiler run in the service.
 * @throws BadRequestException (ACCESS_INVALID_REQUEST) out of range.
 */
export function toListQuery(args: ListArguments): ListDocumentsQuery {
  if (
    !Number.isInteger(args.page) ||
    args.page < PAGINATION.FIRST_PAGE ||
    args.page > DOCUMENT_QUERY_LIMITS.MAX_PAGE
  ) {
    reject([DOCUMENT_QUERY_KEYS.PAGE], GRAPHQL_MESSAGES.PAGE_OUT_OF_RANGE);
  }
  if (
    !Number.isInteger(args.pageSize) ||
    args.pageSize < 1 ||
    args.pageSize > PAGINATION.MAX_PAGE_SIZE
  ) {
    reject(
      [DOCUMENT_QUERY_KEYS.PAGE_SIZE],
      GRAPHQL_MESSAGES.PAGE_SIZE_OUT_OF_RANGE,
    );
  }
  const requested = sortToKeys(args.sort);
  checkSort(requested);
  const filters = filterToClauses(args.filter);
  checkFilters(filters);
  return {
    status: args.status,
    page: args.page,
    pageSize: args.pageSize,
    sort:
      requested.length > 0
        ? requested
        : SORT_DEFAULT.map((key) => ({ ...key })),
    filters,
  };
}

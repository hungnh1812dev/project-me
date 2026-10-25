import { INVALID_REQUEST_ERROR } from '../../../common/constants/error.constants';
import { DomainError } from '../../../common/errors/Domain.errors';
import {
  PAGINATION,
  type RequestIssue,
} from '../../../common/validation/SharedSchemas.rules';
import type { ConditionValueKind } from '../../access';
import {
  type ContentStatus,
  fieldTypeOf,
  type FieldDefinition,
} from '../../content-engine';
import {
  DOCUMENT_QUERY_LIMITS,
  type FilterOperator,
  LIST_QUERY_MESSAGES,
  LIST_QUERY_PARTS,
  SORT_DEFAULT,
} from './Documents.constants';

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

/**
 * What a top-level content field compares and sorts as in a document list
 * query; `undefined` = the field cannot be filtered or sorted. The registry's
 * `listQueryable` decides: components, `json` and `media` (its column holds
 * the internal file id, which never crosses the API) are not queryable.
 * One rule for REST (`queryColumnOf`) and the GraphQL schema builder.
 */
export function queryKindOfField(
  field: FieldDefinition,
): ConditionValueKind | undefined {
  const spec = fieldTypeOf(field.type);
  if (spec === undefined || !spec.listQueryable) return undefined;
  return spec.conditionKind ?? undefined;
}

const FIELD_PATH_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const FILTER_PATH = [LIST_QUERY_PARTS.FILTER];

function reject(path: readonly string[], message: string): never {
  const issue: RequestIssue = { path, message };
  throw new DomainError({
    kind: 'invalid_input',
    errorCode: INVALID_REQUEST_ERROR.CODE,
    message: INVALID_REQUEST_ERROR.MESSAGE,
    details: {
      issues: [{ path: issue.path.map(String), message: issue.message }],
    },
  });
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function checkPaging({ page, pageSize }: ListDocumentsQuery): void {
  if (
    !isIntegerInRange(
      page,
      PAGINATION.FIRST_PAGE,
      DOCUMENT_QUERY_LIMITS.MAX_PAGE,
    )
  ) {
    reject([LIST_QUERY_PARTS.PAGE], LIST_QUERY_MESSAGES.PAGE_OUT_OF_RANGE);
  }
  if (!isIntegerInRange(pageSize, 1, PAGINATION.MAX_PAGE_SIZE)) {
    reject(
      [LIST_QUERY_PARTS.PAGE_SIZE],
      LIST_QUERY_MESSAGES.PAGE_SIZE_OUT_OF_RANGE,
    );
  }
}

function checkSort({ sort }: ListDocumentsQuery): void {
  if (sort.some((key) => !FIELD_PATH_PATTERN.test(key.path))) {
    reject([LIST_QUERY_PARTS.SORT], LIST_QUERY_MESSAGES.SORT_BAD_KEY);
  }
  if (
    sort.length > DOCUMENT_QUERY_LIMITS.MAX_SORT_KEYS ||
    new Set(sort.map((key) => key.path)).size !== sort.length
  ) {
    reject(
      [LIST_QUERY_PARTS.SORT],
      LIST_QUERY_MESSAGES.SORT_DUPLICATE_OR_TOO_MANY,
    );
  }
}

function checkFilters({ filters }: ListDocumentsQuery): void {
  if (filters.length > DOCUMENT_QUERY_LIMITS.MAX_FILTERS) {
    reject(FILTER_PATH, LIST_QUERY_MESSAGES.FILTER_TOO_MANY);
  }
  for (const { path, op, values } of filters) {
    const hasBadCount =
      values.length === 0 ||
      (op !== 'in' && values.length !== 1) ||
      values.length > DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES;
    const hasTooLongValue = values.some(
      (value) => value.length > DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH,
    );
    if (!FIELD_PATH_PATTERN.test(path)) {
      reject(FILTER_PATH, LIST_QUERY_MESSAGES.FILTER_BAD_PATH);
    }
    if (hasBadCount || hasTooLongValue) {
      reject(FILTER_PATH, LIST_QUERY_MESSAGES.FILTER_BAD_VALUE);
    }
  }
}

/**
 * The one shape-and-limits check of a list query, called by the REST parser
 * and the GraphQL argument mapper. An empty sort becomes the default sort.
 * It does not decide which fields may be read: `QueryGuard.assert` does that
 * in `DocumentsQueryService.list`. Messages never contain a submitted value.
 * @throws DomainError (invalid_input, ACCESS_INVALID_REQUEST) out of range.
 */
export function normalizeListQuery(
  candidate: ListDocumentsQuery,
): ListDocumentsQuery {
  checkPaging(candidate);
  checkSort(candidate);
  checkFilters(candidate);
  return {
    ...candidate,
    sort:
      candidate.sort.length > 0
        ? candidate.sort
        : SORT_DEFAULT.map((key) => ({ ...key })),
  };
}

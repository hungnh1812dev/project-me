import {
  invalidRequest,
  PAGINATION,
  type RequestIssue,
} from '../../common/http/request-parsing';
import {
  DOCUMENT_QUERY_KEYS,
  DOCUMENT_QUERY_LIMITS,
  LIST_QUERY_MESSAGES,
  SORT_DEFAULT,
} from './documents.constants';
import type { ListDocumentsQuery } from './dto/list-documents.query';

const FIELD_PATH_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const FILTER_PATH = [DOCUMENT_QUERY_KEYS.FILTER];

function reject(path: readonly string[], message: string): never {
  const issue: RequestIssue = { path, message };
  throw invalidRequest([issue]);
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
    reject([DOCUMENT_QUERY_KEYS.PAGE], LIST_QUERY_MESSAGES.PAGE_OUT_OF_RANGE);
  }
  if (!isIntegerInRange(pageSize, 1, PAGINATION.MAX_PAGE_SIZE)) {
    reject(
      [DOCUMENT_QUERY_KEYS.PAGE_SIZE],
      LIST_QUERY_MESSAGES.PAGE_SIZE_OUT_OF_RANGE,
    );
  }
}

function checkSort({ sort }: ListDocumentsQuery): void {
  if (sort.some((key) => !FIELD_PATH_PATTERN.test(key.path))) {
    reject([DOCUMENT_QUERY_KEYS.SORT], LIST_QUERY_MESSAGES.SORT_BAD_KEY);
  }
  if (
    sort.length > DOCUMENT_QUERY_LIMITS.MAX_SORT_KEYS ||
    new Set(sort.map((key) => key.path)).size !== sort.length
  ) {
    reject(
      [DOCUMENT_QUERY_KEYS.SORT],
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
 * @throws BadRequestException (ACCESS_INVALID_REQUEST) out of range.
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

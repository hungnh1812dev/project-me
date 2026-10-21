import type { ConditionValueKind } from '../access/conditions.compiler';
import type { RecordSystemField } from '../access/access.constants';

/** Error codes of the documents API (T20). */
export const DOCUMENT_ERROR_CODES = {
  NOT_FOUND: 'DOCUMENT_NOT_FOUND',
} as const;

export const DOCUMENT_ERROR_MESSAGES = {
  NOT_FOUND: 'Document not found.',
  DRAFTS_FORBIDDEN: 'You may not read drafts of this content type.',
  UNSUPPORTED_FIELD:
    'The field cannot be used in a filter or sort: only top-level scalar fields and system fields can.',
  UNSUPPORTED_OPERATOR: 'The operator cannot be used with this field.',
  INVALID_VALUE: 'The value does not match the type of the field.',
} as const;

/** `status` default when a request names none: what the public sees. */
export const DEFAULT_DOCUMENT_STATUS = 'published';

/** Query parameters of `GET /documents/:slug` (everything else is a 400). */
export const DOCUMENT_QUERY_KEYS = {
  STATUS: 'status',
  PAGE: 'page',
  PAGE_SIZE: 'pageSize',
  SORT: 'sort',
} as const;

/** `filter[field]=v` (same as `eq`) and `filter[field][op]=v`. */
export const FILTER_KEY_PREFIX = 'filter[';
export const FILTER_KEY_PATTERN =
  /^filter\[([^[\]]{1,200})\](?:\[([^[\]]{1,16})\])?$/;
export const FILTER_DEFAULT_OPERATOR = 'eq';

export const FILTER_OPERATORS = [
  'eq',
  'ne',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const EQUALITY: readonly FilterOperator[] = ['eq', 'ne', 'in'];
const ORDERING: readonly FilterOperator[] = [
  ...EQUALITY,
  'gt',
  'gte',
  'lt',
  'lte',
];

/** Operators a value kind supports. `contains` is a case-insensitive substring match. */
export const OPERATORS_BY_KIND: Readonly<
  Record<ConditionValueKind, readonly FilterOperator[]>
> = {
  string: [...EQUALITY, 'contains'],
  integer: ORDERING,
  decimal: ORDERING,
  date: ORDERING,
  datetime: ORDERING,
  boolean: EQUALITY,
  uuid: EQUALITY,
};

/** Sort direction prefix: `sort=-updatedAt,title`. */
export const SORT_DESCENDING_PREFIX = '-';
export const SORT_SEPARATOR = ',';
export const SORT_DEFAULT: readonly { path: string; direction: 'desc' }[] = [
  { path: 'updatedAt', direction: 'desc' },
];

export const DOCUMENT_QUERY_LIMITS = {
  MAX_FILTERS: 10,
  MAX_SORT_KEYS: 3,
  MAX_IN_VALUES: 20,
  MAX_VALUE_LENGTH: 255,
  MAX_SORT_LENGTH: 500,
  /** Deepest page reachable: with the largest page size, one million rows. */
  MAX_PAGE: 10_000,
} as const;

/** What each root system field compares as. */
export const SYSTEM_FIELD_KINDS: Readonly<
  Record<RecordSystemField, ConditionValueKind>
> = {
  documentId: 'uuid',
  version: 'integer',
  publishedAt: 'datetime',
  locale: 'string',
  createdAt: 'datetime',
  updatedAt: 'datetime',
  createdBy: 'integer',
  updatedBy: 'integer',
};

/** Tie-break of every list order, so pages never overlap. */
export const LIST_TIEBREAK_COLUMN = 'id';

export const FILTER_VALUE_PATTERNS = {
  INTEGER: /^-?\d{1,15}$/,
  DECIMAL: /^-?\d{1,30}(?:\.\d{1,12})?$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  DATETIME:
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/,
  LIKE_SPECIALS: /[\\%_]/g,
} as const;

/** Integer columns are Postgres `integer`: a larger value would be a DB error. */
export const INT4_MAX = 2_147_483_647;
export const YEAR_ZERO_PREFIX = '0000';

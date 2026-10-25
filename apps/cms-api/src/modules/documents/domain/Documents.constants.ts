import type { ConditionValueKind, RecordSystemField } from '../../access';

/** Error codes of the documents API. */
export const DOCUMENT_ERROR_CODES = {
  NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  /** A write names a `version` that is no longer the stored one (SPEC §9). */
  VERSION_CONFLICT: 'DOCUMENT_VERSION_CONFLICT',
  /** A write value fails the field's type or `required` rule. */
  INVALID: 'DOCUMENT_INVALID',
  /** Publish or unpublish on a content type without draft and publish. */
  NOT_PUBLISHABLE: 'DOCUMENT_NOT_PUBLISHABLE',
  /** A bulk request on a single type (SPEC §9: bulk is for collections). */
  BULK_NOT_COLLECTION: 'DOCUMENT_BULK_NOT_COLLECTION',
  /** A bulk request over the item, component row or body limits. */
  BULK_LIMIT: 'DOCUMENT_BULK_LIMIT',
} as const;

export const DOCUMENT_ERROR_MESSAGES = {
  NOT_FOUND: 'Document not found.',
  VERSION_CONFLICT:
    'The document was changed by someone else. Review the current version and submit again.',
  INVALID_BODY: 'The request body is not valid.',
  NOT_PUBLISHABLE: 'This content type has no draft and publish.',
  PUBLISH_CONFLICT:
    'The draft was changed since you loaded it. Reload it and publish again.',
  REQUIRED: 'is required',
  INVALID_TYPE: 'does not match the type of the field',
  DRAFTS_FORBIDDEN: 'You may not read drafts of this content type.',
  BULK_NOT_COLLECTION: 'Bulk requests are only available for collections.',
  BULK_DUPLICATE_DOCUMENT: 'The same document appears twice in the request.',
  UNSUPPORTED_FIELD:
    'The field cannot be used in a filter or sort: only top-level scalar fields and system fields can.',
  UNSUPPORTED_OPERATOR: 'The operator cannot be used with this field.',
  INVALID_VALUE: 'The value does not match the type of the field.',
} as const;

/** `status` default when a request names none: what the public sees. */
export const DEFAULT_DOCUMENT_STATUS = 'published';

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

export const SORT_DEFAULT: readonly { path: string; direction: 'desc' }[] = [
  { path: 'updatedAt', direction: 'desc' },
];

/** The parts of a list query a refusal can name; REST maps its URL keys to these. */
export const LIST_QUERY_PARTS = {
  PAGE: 'page',
  PAGE_SIZE: 'pageSize',
  SORT: 'sort',
  FILTER: 'filter',
} as const;

/** Why a list query was refused; shared by REST and GraphQL. */
export const LIST_QUERY_MESSAGES = {
  FILTER_TOO_MANY: 'Too many filter entries.',
  FILTER_BAD_PATH: 'Malformed filter parameter.',
  FILTER_BAD_VALUE: 'Invalid filter value.',
  SORT_BAD_KEY: 'Invalid sort key.',
  SORT_DUPLICATE_OR_TOO_MANY: 'Too many or repeated sort keys.',
  PAGE_OUT_OF_RANGE: 'page is out of range.',
  PAGE_SIZE_OUT_OF_RANGE: 'pageSize is out of range.',
} as const;

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

/** Name of the placeholder uid of a submitted component item that has none yet. */
export const NEW_ITEM_UID = '';

/** SPEC D16 presence: a heartbeat keeps an editor listed for this long. */
export const PRESENCE_TTL_MS = 45_000;

/** Most live presence entries held in memory; at the cap new editors are refused (429). */
export const PRESENCE_MAX_ENTRIES = 5_000;

export const PRESENCE_STATES = ['viewing', 'editing'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const PRESENCE_MESSAGES = {
  STORE_FULL: 'Too many active editors, try again later.',
} as const;

/** SPEC §6 bulk limits. */
export const BULK_LIMITS = {
  MAX_ITEMS: 50,
  MAX_COMPONENT_ROWS_PER_ITEM: 200,
  MAX_BODY_BYTES: 1024 * 1024,
} as const;

export const BULK_MESSAGES = {
  TOO_MANY_ITEMS: `A bulk request holds at most ${BULK_LIMITS.MAX_ITEMS} items.`,
  TOO_MANY_COMPONENT_ROWS: `An item holds at most ${BULK_LIMITS.MAX_COMPONENT_ROWS_PER_ITEM} component rows.`,
  BODY_TOO_LARGE: `The request body is larger than ${BULK_LIMITS.MAX_BODY_BYTES} bytes.`,
  INVALID_JSON: 'The request body is not valid JSON.',
} as const;

export interface BulkRequest<Item> {
  atomic: boolean;
  items: Item[];
}

export interface PublishItem {
  documentId: string;
  expectedVersion: number;
}

/** Per-item outcome in a bulk response. */
export const BULK_ITEM_STATUS = { OK: 'ok', ERROR: 'error' } as const;

/** The bulk operations, one route each. */
export const BULK_OPERATIONS = [
  'create',
  'publish',
  'unpublish',
  'delete',
] as const;
export type BulkOperation = (typeof BULK_OPERATIONS)[number];

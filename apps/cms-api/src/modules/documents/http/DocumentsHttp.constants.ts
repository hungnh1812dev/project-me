import { LIST_QUERY_PARTS } from '../domain/Documents.constants';

/** Route param holding a record's document_id in DOCUMENTS_ROUTES. */
export const DOCUMENT_ID_PARAM = 'documentId';

/** Query parameters of `GET /documents/:slug` (everything else is a 400). */
export const DOCUMENT_QUERY_KEYS = {
  STATUS: 'status',
  ...LIST_QUERY_PARTS,
} as const;

/** `filter[field]=v` (same as `eq`) and `filter[field][op]=v`. */
export const FILTER_KEY_PREFIX = 'filter[';
export const FILTER_KEY_PATTERN =
  /^filter\[([^[\]]{1,200})\](?:\[([^[\]]{1,16})\])?$/;
export const FILTER_DEFAULT_OPERATOR = 'eq';

/** Sort direction prefix: `sort=-updatedAt,title`. */
export const SORT_DESCENDING_PREFIX = '-';
export const SORT_SEPARATOR = ',';
/** Body key of `PUT` carrying the version the client edited. */
export const VERSION_BODY_KEY = 'version';

/** Body key of `POST .../publish`: the draft version the client reviewed. */
export const EXPECTED_VERSION_BODY_KEY = 'expectedVersion';

/** Body keys of `POST /documents/:slug/bulk/*`. */
export const BULK_BODY_KEYS = {
  ATOMIC: 'atomic',
  ITEMS: 'items',
  DOCUMENT_ID: 'documentId',
} as const;

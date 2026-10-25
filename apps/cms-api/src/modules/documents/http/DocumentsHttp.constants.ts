import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../../common/constants/limits.constants';
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

/** SPEC §9 documents (read). `:documentId` is the record's document_id. */
export const DOCUMENTS_ROUTES = {
  ROOT: 'documents',
  BY_SLUG: ':slug',
  BY_ID: ':slug/:documentId',
  PUBLISH: ':slug/:documentId/publish',
  UNPUBLISH: ':slug/:documentId/unpublish',
  PRESENCE: ':slug/:documentId/presence',
  /**
   * SPEC §9 bulk: `BulkController` lives under `documents/:slug/bulk`
   * and is registered before `DocumentsController` (`bulk` is no document id).
   */
  BULK_PREFIX: ':slug/bulk',
  BULK_CREATE: 'create',
  BULK_PUBLISH: 'publish',
  BULK_UNPUBLISH: 'unpublish',
  BULK_DELETE: 'delete',
} as const;

export const DOCUMENTS_RATE_LIMIT_POLICIES = {
  /**
   * Anonymous `GET /documents/...` (user decision): 120 per minute per
   * IP. Signed-in accounts and API tokens are not counted. In memory.
   */
  DOCUMENT_READ_ANONYMOUS: [
    {
      name: 'document-read:anonymous-ip',
      keySource: RATE_LIMIT_KEY_SOURCES.ANONYMOUS_IP,
      maxHits: 120,
      windowMs: ONE_MINUTE_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

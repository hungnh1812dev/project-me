import type { NavSectionId } from '../../lib/NavSections.constants';

/** Form-state key holding a component item's `componentUid` ('' = new item). */
export const ITEM_UID_KEY = '__uid';

/** Component nesting limit enforced by cms-api (depth 3). */
export const MAX_COMPONENT_DEPTH = 3;

/** A non-repeatable component holds at most this many items. */
export const SINGLE_COMPONENT_MAX_ITEMS = 1;

/** Document `status` query values (SPEC §9). */
export const DOCUMENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const;

/** Route segment that stands for "no document yet". */
export const NEW_DOCUMENT_SEGMENT = 'new';

/** Field `type` values of cms-api's content definitions. */
export const FIELD_TYPE = {
  STRING: 'string',
  TEXT: 'text',
  RICHTEXT: 'richtext',
  INTEGER: 'integer',
  DECIMAL: 'decimal',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'datetime',
  JSON: 'json',
  MEDIA: 'media',
  COMPONENT: 'component',
} as const;

/** Placeholder cms-api sends for a value the caller's role cannot read. */
export const MASKED_VALUE = '***';

/** Response key listing the paths the caller's role cannot read. */
export const MASKED_FIELDS_KEY = '_maskedFields';

/** Presence heartbeat period (SPEC D16); the server drops an entry after 45 s. */
export const PRESENCE_HEARTBEAT_MS = 20_000;

/** `state` values the presence endpoint accepts. */
export const PRESENCE_STATE = {
  VIEWING: 'viewing',
  EDITING: 'editing',
} as const;

/** Rows per page of the collection list; stays under the bulk item limit. */
export const CONTENT_LIST_PAGE_SIZE = 20;

/** Items per bulk request (cms-api `DOCUMENT_BULK_LIMIT`). */
export const BULK_MAX_ITEMS = 50;

/** Value columns shown beside the title column of the collection list. */
export const LIST_MAX_VALUE_COLUMNS = 3;

/** Bulk endpoints (`POST /documents/:slug/bulk/<action>`). */
export const BULK_ACTION = {
  CREATE: 'create',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
  DELETE: 'delete',
} as const;

export type BulkAction = (typeof BULK_ACTION)[keyof typeof BULK_ACTION];

/** Per-item result `status` of a bulk response. */
export const BULK_ITEM_STATUS = { OK: 'ok', ERROR: 'error' } as const;

/** System sort key of the list (cms-api default order is `-updatedAt`). */
export const LIST_UPDATED_KEY = 'updatedAt';

/** `kind` of a content type that holds many documents (bulk works on these). */
export const COLLECTION_KIND = 'collection';

/** `kind` of a content type that holds exactly one document. */
export const SINGLE_KIND = 'single';

/** Side-menu section of each content-type `kind`; a new kind is one entry here. */
export const NAV_SECTION_BY_KIND: Readonly<Record<string, NavSectionId>> = {
  [SINGLE_KIND]: 'singleTypes',
  [COLLECTION_KIND]: 'collectionTypes',
};

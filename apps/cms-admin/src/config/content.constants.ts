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

/** Response key listing the paths the caller's role cannot read. */
export const MASKED_FIELDS_KEY = '_maskedFields';

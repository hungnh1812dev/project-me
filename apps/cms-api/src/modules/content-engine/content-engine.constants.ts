/** Postgres schema that holds every generated content table (SPEC §8.2). */
export const CONTENT_DB_SCHEMA = 'content';

/** SPEC §6: max component nesting below the root. */
export const MAX_COMPONENT_DEPTH = 3;

/** SPEC §6: Postgres NAMEDATALEN - 1. Longer names are silently truncated by Postgres. */
export const MAX_IDENTIFIER_BYTES = 63;

/** SPEC §6: canonical rule every generated SQL identifier must match. */
export const SQL_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Content type slug as written in the definition (kebab-case, used in URLs). */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Joins the slug and component field names into a component table name. */
export const TABLE_PATH_SEPARATOR = '__';

export const CONTENT_TYPE_KINDS = ['single', 'collection'] as const;

export const SCALAR_FIELD_TYPES = [
  'string',
  'text',
  'richtext',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'json',
  'media',
] as const;

export const COMPONENT_FIELD_TYPE = 'component';

/** Stored as an int referencing `public.file_library(id)`. */
export const MEDIA_FIELD_TYPE =
  'media' satisfies (typeof SCALAR_FIELD_TYPES)[number];

export const FIELD_TYPES = [
  ...SCALAR_FIELD_TYPES,
  COMPONENT_FIELD_TYPE,
] as const;

/** Engine-owned columns of every root table (SPEC §8.1 / §8.2). */
export const ROOT_SYSTEM_COLUMNS = [
  'id',
  'document_id',
  'version',
  'published_at',
  'locale',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
] as const;

/** Engine-owned columns of every component table (SPEC §8.2). */
export const COMPONENT_SYSTEM_COLUMNS = [
  'id',
  'component_uid',
  'parent_id',
  'order_index',
] as const;

/**
 * Names the engine or API owns even without a column today (`status` is the
 * draft/published filter). Fields may not use them anywhere.
 */
export const ENGINE_RESERVED_NAMES = [
  ...new Set<string>([
    ...ROOT_SYSTEM_COLUMNS,
    ...COMPONENT_SYSTEM_COLUMNS,
    'status',
  ]),
];

/**
 * Postgres reserved key words (both "reserved" and "reserved (can be function
 * or type)" in the SQL Key Words appendix, PG 16). Neither kind can be used
 * unquoted as a table or column name.
 * Generated SQL quotes identifiers anyway; banning them keeps hand-written
 * SQL and tooling safe.
 */
export const SQL_RESERVED_WORDS = [
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'authorization',
  'binary',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'collation',
  'column',
  'concurrently',
  'constraint',
  'create',
  'cross',
  'current_catalog',
  'current_date',
  'current_role',
  'current_schema',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'grant',
  'group',
  'having',
  'ilike',
  'in',
  'initially',
  'inner',
  'intersect',
  'into',
  'is',
  'isnull',
  'join',
  'lateral',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'natural',
  'not',
  'notnull',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'overlaps',
  'placing',
  'primary',
  'references',
  'returning',
  'right',
  'select',
  'session_user',
  'similar',
  'some',
  'symmetric',
  'system_user',
  'table',
  'tablesample',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'variadic',
  'verbose',
  'when',
  'where',
  'window',
  'with',
] as const;

/** Suffixes appended to a table name for the objects T06 names explicitly. */
export const RELATION_NAME_SUFFIXES = {
  primaryKey: '_pk',
  parentForeignKey: '_parent_fk',
  parentOrderIndex: '_parent_idx',
  draftUnique: '_draft_uq',
  publishedUnique: '_published_uq',
  publishedListIndex: '_published_idx',
  mediaForeignKey: '_media_fk',
} as const;

/** Rule codes carried by every definition validation error. */
export const DEFINITION_RULES = {
  /** Shape is wrong: unknown key, wrong type, missing property. */
  SCHEMA_INVALID: 'schema.invalid',
  /** A name fails the slug pattern or its SQL form fails `^[a-z][a-z0-9_]*$`. */
  IDENTIFIER_INVALID: 'identifier.invalid',
  /** A name is an engine-owned column or a Postgres reserved word. */
  IDENTIFIER_RESERVED: 'identifier.reserved',
  /** A composed SQL name is longer than 63 bytes. */
  IDENTIFIER_TOO_LONG: 'identifier.too_long',
  /** Two names are equal after normalisation. */
  IDENTIFIER_COLLISION: 'identifier.collision',
  /** A component is nested deeper than MAX_COMPONENT_DEPTH. */
  COMPONENT_DEPTH_EXCEEDED: 'component.depth_exceeded',
} as const;

/**
 * Postgres column type per scalar field type (T06). `string`, `text` and
 * `richtext` differ only in validation and editor, so they share `text`.
 * `media` holds a `file_library.id`; its FK is added once that table exists.
 */
export const COLUMN_TYPES: Readonly<
  Record<(typeof SCALAR_FIELD_TYPES)[number], string>
> = {
  string: 'text',
  text: 'text',
  richtext: 'text',
  integer: 'integer',
  decimal: 'numeric',
  boolean: 'boolean',
  date: 'date',
  datetime: 'timestamptz',
  json: 'jsonb',
  media: 'integer',
};

/**
 * Engine bookkeeping tables. They live in the `content` schema with a
 * leading underscore, which no slug can produce, so they never collide with
 * generated tables, and Prisma (which owns `public`) never sees them.
 */
export const META_TABLES = {
  migrations: '_migrations',
  contentTypes: '_content_types',
} as const;

/** Key for `pg_advisory_xact_lock`: serialises concurrent `content:migrate` runs. */
export const MIGRATION_LOCK_KEY = 7_163_201_906;

export const MIGRATION_FILE_EXTENSION = '.sql';
export const MIGRATION_SNAPSHOT_FILE = 'snapshot.json';
export const SCHEMA_FILE_EXTENSION = '.json';
/** `0001_<label>.sql`: zero-padded sequence keeps lexical order = apply order. */
export const MIGRATION_SEQUENCE_DIGITS = 4;
export const MIGRATION_LABEL_PATTERN = /^[a-z0-9_]+$/;
export const DEFAULT_MIGRATION_LABEL = 'content';
export const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;
export const SNAPSHOT_FORMAT_VERSION = 1;
export const HASH_ALGORITHM = 'sha256';

/**
 * Which row of a document an operation targets (SPEC D11). The root tables
 * have no status column: a draft row has `published_at IS NULL`, the
 * published row has it set.
 */
export const CONTENT_STATUSES = ['draft', 'published'] as const;

/** Codes carried by content engine runtime errors (registry and repository, T07). */
export const CONTENT_ERROR_CODES = {
  /** The slug is not in the registry. */
  CONTENT_TYPE_UNKNOWN: 'content_type.unknown',
  /** No root row for this document id + status. */
  DOCUMENT_NOT_FOUND: 'document.not_found',
  /** The tree input is malformed (wrong type, unknown key, too many items). */
  TREE_INVALID: 'tree.invalid',
  /** A `componentUid` or `documentId` is not a UUID. */
  TREE_INVALID_UID: 'tree.invalid_uid',
  /** The same `componentUid` appears twice in one list. */
  TREE_DUPLICATE_UID: 'tree.duplicate_uid',
  /** A `componentUid` sent to replaceTree does not exist under that parent and field. */
  TREE_UNKNOWN_UID: 'tree.unknown_uid',
} as const;

/** Canonical UUID text form (any version), case-insensitive. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A non-repeatable component holds at most this many items. */
export const SINGLE_COMPONENT_MAX_ITEMS = 1;

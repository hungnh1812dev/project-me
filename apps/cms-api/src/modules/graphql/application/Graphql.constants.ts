/** Generated SDL of the content registry, next to `content/schemas`. */
export const GRAPHQL_SDL_FILE_NAME = 'schema.graphql';

/** Root type of every query. */
export const QUERY_TYPE_NAME = 'Query';

/** Scalars of the schema (SPEC D18): string on the wire, as in REST. */
export const SCALAR_NAMES = {
  DATE: 'Date',
  DATE_TIME: 'DateTime',
  DECIMAL: 'Decimal',
  JSON: 'JSON',
} as const;

/** Types every schema has, whatever the content types are. */
export const SHARED_TYPE_NAMES = {
  DOCUMENT_STATUS: 'DocumentStatus',
  SORT_DIRECTION: 'SortDirection',
  PAGE_META: 'PageMeta',
  MEDIA: 'Media',
} as const;

/** One filter input per REST operator set (value kind). */
export const FILTER_INPUT_NAMES = {
  string: 'TextFilter',
  integer: 'IntFilter',
  decimal: 'DecimalFilter',
  date: 'DateFilter',
  datetime: 'DateTimeFilter',
  boolean: 'BooleanFilter',
  uuid: 'IdFilter',
} as const;

/** Names graphql-js already owns. */
export const BUILT_IN_TYPE_NAMES = [
  'String',
  'Int',
  'Float',
  'Boolean',
  'ID',
] as const;

/** Name parts of the generated types: `CvPage` + `Page` / `Filter` / `Sort`. */
export const TYPE_SUFFIXES = {
  PAGE: 'Page',
  FILTER: 'Filter',
  SORT: 'Sort',
  SORT_FIELD: 'SortField',
  /** Root list field: `cvPage` -> `cvPageList`. */
  LIST_FIELD: 'List',
} as const;

/** Separator of a component type name: `CvPage_Experience_Role`. */
export const COMPONENT_NAME_SEPARATOR = '_';

/** Name of the component uid field (the engine's `component_uid`). */
export const COMPONENT_UID_FIELD = 'componentUid';

/** Root fields describe themselves to the resolvers (GQ2) in `extensions`. */
export const ROOT_FIELD_EXTENSION_KEY = 'abyss';

export const ROOT_OPERATIONS = {
  /** One document by `documentId` (collection types). */
  ITEM: 'item',
  /** A page of documents (collection types). */
  LIST: 'list',
  /** The one document of a `single` type. */
  SINGLE: 'single',
} as const;
export type RootOperation =
  (typeof ROOT_OPERATIONS)[keyof typeof ROOT_OPERATIONS];

/** What a root field's `extensions[ROOT_FIELD_EXTENSION_KEY]` carries. */
export interface RootFieldExtension {
  slug: string;
  operation: RootOperation;
}

export const GRAPHQL_SCHEMA_ERROR_MESSAGES = {
  NO_CONTENT_TYPES:
    'GraphQL schema needs at least one content type: the Query type would have no fields.',
  UNKNOWN_FIELD_TYPE: (fieldType: string) =>
    `Field type "${fieldType}" has no entry in the field-type registry.`,
} as const;

/**
 * Request limits (docs/modules/graphql.md "Limits"). Body size is
 * checked before parsing (413), the rest while parsing and validating
 * (400 `GRAPHQL_LIMIT_EXCEEDED`).
 */
export const GRAPHQL_LIMITS = {
  MAX_BODY_BYTES: 32 * 1024,
  MAX_TOKENS: 2_000,
  MAX_DEPTH: 8,
  MAX_ROOT_FIELDS: 5,
  MAX_FIELD_NODES: 500,
  /** Per-caller schemas kept in memory (one per distinct readable set). */
  MAX_CACHED_SCHEMAS: 64,
} as const;

/** GraphQL-only `extensions.code` values (SPEC D18); the rest reuse REST codes. */
export const GRAPHQL_ERROR_CODES = {
  PARSE_FAILED: 'GRAPHQL_PARSE_FAILED',
  VALIDATION_FAILED: 'GRAPHQL_VALIDATION_FAILED',
  LIMIT_EXCEEDED: 'GRAPHQL_LIMIT_EXCEEDED',
} as const;

/** Why a document is over a limit (never echoes any of its content). */
export const GRAPHQL_LIMIT_MESSAGES = {
  BODY_TOO_LARGE: `The request body is larger than ${GRAPHQL_LIMITS.MAX_BODY_BYTES} bytes.`,
  TOKENS: `The query has more than ${GRAPHQL_LIMITS.MAX_TOKENS} tokens.`,
  DEPTH: `The query is nested deeper than ${GRAPHQL_LIMITS.MAX_DEPTH} levels.`,
  ROOT_FIELDS: `The query selects more than ${GRAPHQL_LIMITS.MAX_ROOT_FIELDS} root fields (aliases count).`,
  FIELD_NODES: `The query selects more than ${GRAPHQL_LIMITS.MAX_FIELD_NODES} fields in total.`,
} as const;

/** graphql-js text of the parser's `maxTokens` abort. */
export const TOKEN_LIMIT_PATTERN = /Document contains more than \d+ tokens/;

/** Dev-only introspection roots; left out of the depth, root and node counts. */
export const INTROSPECTION_ROOT_FIELDS = ['__schema', '__type'] as const;

/** Request body keys of `POST /graphql`. */
export const GRAPHQL_REQUEST_MEDIA_TYPE = 'application/json';

export const GRAPHQL_MESSAGES = {
  UNSUPPORTED_MEDIA_TYPE: 'The request body must be application/json.',
  INVALID_VARIABLES: 'The variables are not valid.',
  /** Same text graphql-js gives an unknown field; the visibility rule reuses it. */
  UNKNOWN_QUERY_FIELD: (field: string) =>
    `Cannot query field "${field}" on type "${QUERY_TYPE_NAME}".`,
  SERVER_ERROR: 'Internal server error',
} as const;

/** `Did you mean ...` hint graphql-js appends; never sent in production. */
export const SUGGESTION_PATTERN = /\s*Did you mean[\s\S]*$/;
/** graphql-js text of a variable coercion error (it echoes the value). */
export const VARIABLE_ERROR_PATTERN = /^Variable "\$(\w+)"/;
/** An unknown field on the Query type (hidden types look the same). */
export const ROOT_UNKNOWN_FIELD_PATTERN = new RegExp(
  `^Cannot query field "[^"]*" on type "${QUERY_TYPE_NAME}"\\.`,
);

/** Query field of the schema of a caller who can read no content type. */
export const NO_READABLE_TYPES_FIELD = '_none';

/** SPEC D18 GraphQL read API: one POST endpoint, queries only. */
export const GRAPHQL_ROUTE = 'graphql';

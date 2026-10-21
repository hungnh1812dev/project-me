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
} as const;

import {
  type GraphQLFieldConfigMap,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  type GraphQLNullableOutputType,
  type GraphQLOutputType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import {
  type ConditionValueKind,
  MASKED_FIELDS_KEY,
  RECORD_SYSTEM_FIELDS,
  type RecordSystemField,
  type SerializedComponent,
} from '../../access';
import { PAGINATION } from '../../../common/http/request-parsing';
import { CONTENT_STATUSES } from '../../content-engine/content-engine.constants';
import {
  type ComponentFieldDefinition,
  type ContentTypeDefinition,
  type FieldDefinition,
  isComponentField,
  type ScalarFieldType,
} from '../../content-engine/definition.schema';
import {
  DEFAULT_DOCUMENT_STATUS,
  SYSTEM_FIELD_KINDS,
} from '../../documents/documents.constants';
import { queryKindOfField } from '../../documents/queryable-fields';
import {
  COMPONENT_UID_FIELD,
  GRAPHQL_SCHEMA_ERROR_MESSAGES,
  QUERY_TYPE_NAME,
  ROOT_FIELD_EXTENSION_KEY,
  ROOT_OPERATIONS,
  type RootFieldExtension,
  SHARED_TYPE_NAMES,
} from '../graphql.constants';
import { FILTER_INPUTS } from './filter-inputs';
import {
  DateScalar,
  DateTimeScalar,
  DecimalScalar,
  JsonScalar,
} from './scalars';
import {
  componentTypeName,
  GraphqlNameClashError,
  NameClaims,
  newTypeNameClaims,
  rootNamesOf,
} from './type-names';

export { GraphqlNameClashError };

/** The definitions cannot make a valid schema (other than by a name clash). */
export class GraphqlSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphqlSchemaError';
  }
}

/** What a content or component field resolver reads: the serializer's output. */
type ValuesHolder = Pick<SerializedComponent, 'values' | 'components'>;

const nonNull = <T extends GraphQLNullableOutputType>(type: T) =>
  new GraphQLNonNull(type);
/** `[T!]`: items are never null, the list itself may be (a masked component). */
const listOf = <T extends GraphQLNullableOutputType>(type: T) =>
  new GraphQLList(new GraphQLNonNull(type));

const DocumentStatusEnum = new GraphQLEnumType({
  name: SHARED_TYPE_NAMES.DOCUMENT_STATUS,
  description: 'Which version of a document to read.',
  values: Object.fromEntries(
    CONTENT_STATUSES.map((status) => [status.toUpperCase(), { value: status }]),
  ),
});

const SortDirectionEnum = new GraphQLEnumType({
  name: SHARED_TYPE_NAMES.SORT_DIRECTION,
  values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } },
});

const PageMetaType = new GraphQLObjectType({
  name: SHARED_TYPE_NAMES.PAGE_META,
  fields: {
    page: { type: nonNull(GraphQLInt) },
    pageSize: { type: nonNull(GraphQLInt) },
    total: { type: nonNull(GraphQLInt) },
  },
});

/** Mirrors the media embed of a document read (T29); the internal id never appears. */
const MediaType = new GraphQLObjectType({
  name: SHARED_TYPE_NAMES.MEDIA,
  fields: {
    id: { type: nonNull(GraphQLID) },
    fileName: { type: GraphQLString },
    url: { type: GraphQLString },
    thumbnailUrl: { type: GraphQLString },
    provider: { type: GraphQLString },
    alt: { type: GraphQLString },
    size: { type: GraphQLInt },
    createdAt: { type: DateTimeScalar },
  },
});

const SHARED_TYPES = [
  DateScalar,
  DateTimeScalar,
  DecimalScalar,
  JsonScalar,
  DocumentStatusEnum,
  SortDirectionEnum,
  PageMetaType,
  MediaType,
  ...Object.values(FILTER_INPUTS),
];

const SCALAR_OUTPUT_TYPES: Readonly<
  Record<ScalarFieldType, GraphQLOutputType>
> = {
  string: GraphQLString,
  text: GraphQLString,
  richtext: GraphQLString,
  integer: GraphQLInt,
  decimal: DecimalScalar,
  boolean: GraphQLBoolean,
  date: DateScalar,
  datetime: DateTimeScalar,
  json: JsonScalar,
  media: MediaType,
};

/** System fields of a record; `createdBy` / `updatedBy` are absent for some actors. */
const SYSTEM_OUTPUT_TYPES: Readonly<
  Record<RecordSystemField, GraphQLOutputType>
> = {
  documentId: nonNull(GraphQLID),
  version: nonNull(GraphQLInt),
  publishedAt: DateTimeScalar,
  locale: GraphQLString,
  createdAt: nonNull(DateTimeScalar),
  updatedAt: nonNull(DateTimeScalar),
  createdBy: GraphQLInt,
  updatedBy: GraphQLInt,
};

function systemFieldConfigs(): GraphQLFieldConfigMap<unknown, unknown> {
  return Object.fromEntries(
    RECORD_SYSTEM_FIELDS.map((name) => [
      name,
      { type: SYSTEM_OUTPUT_TYPES[name] },
    ]),
  );
}

/**
 * The content fields of one object type. Each reads the serializer's output
 * (`values` or `components`), so masking is decided there and only there:
 * nothing is recomputed. Every content field is nullable: masked = `"***"`
 * or `null`, a masked component = `null` (never `[]`); a non-repeatable
 * component is its one item or `null`.
 */
function contentFieldConfigs(
  fields: readonly FieldDefinition[],
  typeFor: (field: ComponentFieldDefinition) => GraphQLObjectType,
): GraphQLFieldConfigMap<ValuesHolder, unknown> {
  const configs: GraphQLFieldConfigMap<ValuesHolder, unknown> = {};
  for (const field of fields) {
    const { name } = field;
    if (isComponentField(field)) {
      const type = typeFor(field);
      const repeatable = field.repeatable === true;
      // The serializer always yields a list (at most one item when not
      // repeatable) or null for a masked component.
      configs[name] = {
        type: repeatable ? listOf(type) : type,
        resolve: (source) => {
          const items = source.components[name] ?? null;
          return repeatable ? items : (items?.[0] ?? null);
        },
      };
    } else {
      configs[name] = {
        type: SCALAR_OUTPUT_TYPES[field.type],
        resolve: (source) => source.values[name] ?? null,
      };
    }
  }
  return configs;
}

function componentTypeOf(
  parentName: string,
  field: ComponentFieldDefinition,
  describe: string,
  claims: NameClaims,
): GraphQLObjectType {
  const name = componentTypeName(parentName, field.name);
  const source = `${describe} component "${field.name}"`;
  claims.claim(name, source);
  return new GraphQLObjectType({
    name,
    fields: {
      [COMPONENT_UID_FIELD]: { type: nonNull(GraphQLID) },
      ...contentFieldConfigs(field.fields, (child) =>
        componentTypeOf(name, child, source, claims),
      ),
    },
  });
}

/** What a list query may filter and sort on, name -> kind (the REST rule). */
function queryableFields(
  definition: ContentTypeDefinition,
): Map<string, ConditionValueKind> {
  const queryable = new Map<string, ConditionValueKind>(
    RECORD_SYSTEM_FIELDS.map((name) => [name, SYSTEM_FIELD_KINDS[name]]),
  );
  for (const field of definition.fields) {
    const kind = queryKindOfField(field);
    if (kind !== undefined) queryable.set(field.name, kind);
  }
  return queryable;
}

interface RootClaims {
  types: NameClaims;
  queryFields: NameClaims;
}

function rootExtensions(
  slug: string,
  operation: RootFieldExtension['operation'],
) {
  const extension: RootFieldExtension = { slug, operation };
  return { [ROOT_FIELD_EXTENSION_KEY]: extension };
}

const statusArg = {
  type: DocumentStatusEnum,
  defaultValue: DEFAULT_DOCUMENT_STATUS,
};

function buildContentType(
  definition: ContentTypeDefinition,
  claims: RootClaims,
): GraphQLFieldConfigMap<unknown, unknown> {
  const { slug } = definition;
  const describe = `content type "${slug}"`;
  const names = rootNamesOf(slug);

  claims.types.claim(names.type, describe);
  const documentType = new GraphQLObjectType({
    name: names.type,
    fields: {
      ...systemFieldConfigs(),
      ...contentFieldConfigs(definition.fields, (field) =>
        componentTypeOf(names.type, field, describe, claims.types),
      ),
      [MASKED_FIELDS_KEY]: {
        type: nonNull(listOf(GraphQLString)),
        description:
          'Paths of the fields the caller may not read; their values are masked or null.',
      },
    },
  });

  claims.queryFields.claim(names.itemField, describe);
  if (definition.kind === 'single') {
    return {
      [names.itemField]: {
        type: documentType,
        args: { status: statusArg },
        extensions: rootExtensions(slug, ROOT_OPERATIONS.SINGLE),
      },
    };
  }

  for (const name of [names.page, names.filter, names.sort, names.sortField]) {
    claims.types.claim(name, describe);
  }
  claims.queryFields.claim(names.listField, describe);

  const queryable = queryableFields(definition);
  const sortField = new GraphQLEnumType({
    name: names.sortField,
    values: Object.fromEntries(
      [...queryable.keys()].map((name) => [name, { value: name }]),
    ),
  });
  const sort = new GraphQLInputObjectType({
    name: names.sort,
    fields: {
      field: { type: new GraphQLNonNull(sortField) },
      direction: { type: SortDirectionEnum, defaultValue: 'asc' },
    },
  });
  const filter = new GraphQLInputObjectType({
    name: names.filter,
    description: 'One optional entry per filterable field; entries are AND-ed.',
    fields: Object.fromEntries(
      [...queryable].map(([name, kind]) => [
        name,
        { type: FILTER_INPUTS[kind] },
      ]),
    ),
  });
  const page = new GraphQLObjectType({
    name: names.page,
    fields: {
      data: { type: nonNull(listOf(documentType)) },
      meta: { type: nonNull(PageMetaType) },
    },
  });

  return {
    [names.itemField]: {
      type: documentType,
      args: {
        documentId: { type: new GraphQLNonNull(GraphQLID) },
        status: statusArg,
      },
      extensions: rootExtensions(slug, ROOT_OPERATIONS.ITEM),
    },
    [names.listField]: {
      type: page,
      args: {
        status: statusArg,
        page: { type: GraphQLInt, defaultValue: PAGINATION.FIRST_PAGE },
        pageSize: {
          type: GraphQLInt,
          defaultValue: PAGINATION.DEFAULT_PAGE_SIZE,
        },
        sort: { type: new GraphQLList(new GraphQLNonNull(sort)) },
        filter: { type: filter },
      },
      extensions: rootExtensions(slug, ROOT_OPERATIONS.LIST),
    },
  };
}

/**
 * The GraphQL schema of the content definitions (SPEC D18, docs/modules/
 * graphql.md "Schema"). Pure: no Nest, no database. Every caller gets the
 * same schema; who may see what is decided by the validation rule and by the
 * serializer. Resolvers of the root fields are attached by the endpoint
 * (GQ2), which finds them through `extensions.abyss`.
 * @throws GraphqlNameClashError when two sources generate the same name.
 * @throws GraphqlSchemaError when there is no content type.
 */
export function buildGraphqlSchema(
  definitions: readonly ContentTypeDefinition[],
): GraphQLSchema {
  if (definitions.length === 0) {
    throw new GraphqlSchemaError(
      GRAPHQL_SCHEMA_ERROR_MESSAGES.NO_CONTENT_TYPES,
    );
  }
  const claims: RootClaims = {
    types: newTypeNameClaims(),
    queryFields: new NameClaims(),
  };
  const sorted = [...definitions].sort((a, b) => a.slug.localeCompare(b.slug));
  const queryFields = sorted.reduce<GraphQLFieldConfigMap<unknown, unknown>>(
    (fields, definition) => ({
      ...fields,
      ...buildContentType(definition, claims),
    }),
    {},
  );
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: QUERY_TYPE_NAME,
      fields: queryFields,
    }),
    types: SHARED_TYPES,
  });
}

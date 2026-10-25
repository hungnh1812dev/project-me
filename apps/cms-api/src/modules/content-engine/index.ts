export { DEFAULT_CONTENT_PATHS } from './cli/content-paths';
export { ContentDbProvider } from './adapters/ContentDatabase.adapter';
// Transitional: documents wraps its own Kysely transaction until CR-dc-3.
export {
  contentTrxOf,
  unitOfWorkFromContentTrx,
} from './adapters/KyselyContentTransactionRunner.adapter';
export type {
  ContentRepository,
  InsertTreeInput,
  LoadTreesQuery,
  ReplaceTreeInput,
} from './application/ContentRepository.port';
export {
  COMPONENT_FIELD_TYPE,
  CONTENT_DB_SCHEMA,
  CONTENT_STATUSES,
  MEDIA_FIELD_TYPE,
  ROOT_SYSTEM_COLUMNS,
  SCALAR_FIELD_TYPES,
} from './domain/ContentEngine.constants';
export { ContentEngineModule } from './ContentEngine.module';
// Names kept for the modules that have not migrated yet; each CR task renames its own imports.
export { ContentRegistry as ContentRegistryProvider } from './application/ContentRegistry.service';
export {
  isComponentField,
  type ComponentFieldDefinition,
  type ContentTypeDefinition,
  type ContentTypeKind,
  type FieldDefinition,
  type ScalarFieldType,
} from './domain/DefinitionSchema.rules';
export {
  FIELD_TYPE_SPECS,
  fieldTypeOf,
  INT4_MAX,
  mediaColumnsOf,
  mediaFieldNamesByTable,
  parseDate,
  parseDatetime,
  parseUuid,
  UUID_PATTERN,
  VALUE_PATTERNS,
  type FieldTypeSpec,
  type FieldValueKind,
  type GraphqlOutputName,
  type MediaColumnRef,
} from './domain/field-types';
export {
  type ContentDocument,
  type ContentStatus,
  type DocumentRef,
} from './domain/ContentDocument.entity';
export {
  type ComponentNode,
  type ComponentTrees,
} from './domain/ContentTree.entity';
export { loadDefinitions } from './adapters/MigrationFiles.adapter';
export {
  ContentTypeRegistry as RegistryService,
  type RegisteredContentType,
  type TableNode,
} from './domain/ContentTypeRegistry.entity';
export { quoteIdentifier } from './domain/SqlGenerator.rules';
export {
  assertTreeInput,
  ContentTreeError,
  isUuid,
  type ComponentInput,
  type ComponentsInput,
  type FieldValues,
  type TreeInput,
} from './domain/TreeInput.rules';

import { join, sep } from 'node:path';

/**
 * Every module file or folder that an architecture spec pins by path (SPEC
 * D3, D6, D9, D12, D15, D18). Paths are relative to `src/`. When a module
 * file moves, this is the one place to edit; `assertPinnedPathsExist` makes
 * a stale entry fail with a "missing path" message instead of an empty scan.
 * Static `import`s of module symbols in the specs are not paths and stay
 * where they are: the compiler reports those.
 */
const MODULES = 'modules';

export const MODULES_PREFIX = `${MODULES}${sep}`;
export const IDENTITY_DIRECTORY = join(MODULES, 'identity') + sep;
export const CONTENT_ENGINE_DIRECTORY = join(MODULES, 'content-engine') + sep;
export const FIELD_TYPES_DIRECTORY = join(
  MODULES,
  'content-engine',
  'domain',
  'field-types',
);
export const GRAPHQL_DIRECTORY = join(MODULES, 'graphql');

export const CONTENT_REPOSITORY_FILE = join(
  MODULES,
  'content-engine',
  'adapters',
  'KyselyContent.repository.ts',
);
export const TREE_LOADER_FILE = join(
  MODULES,
  'content-engine',
  'adapters',
  'TreeLoader.adapter.ts',
);
export const CONTENT_ROW_MAPPING_FILE = join(
  MODULES,
  'content-engine',
  'domain',
  'ContentRowMapping.rules.ts',
);
export const FIELD_PROJECTION_FILE = join(
  MODULES,
  'access',
  'domain',
  'FieldProjection.rules.ts',
);
export const RECORD_LOADER_FILES = [CONTENT_REPOSITORY_FILE, TREE_LOADER_FILE];
/** A file that reads records through the loaders; proves the scanner sees real edges. */
export const RECORD_LOADER_CONSUMER_FILE = join(
  MODULES,
  'documents',
  'adapters',
  'KyselyDocument.repository.ts',
);
/**
 * Files that bypass masking: no module facade re-exports them. Mapping a row
 * to a `ContentDocument` skips masking too (D3).
 */
export const UNMASKED_FILES = [
  ...RECORD_LOADER_FILES,
  CONTENT_ROW_MAPPING_FILE,
  FIELD_PROJECTION_FILE,
];

export const RECORD_SERIALIZER_FILE = join(
  MODULES,
  'access',
  'domain',
  'RecordSerializer.ts',
);
export const ACCESS_CONSTANTS_FILE = join(
  MODULES,
  'access',
  'domain',
  'Access.constants.ts',
);
/** Ports whose methods return loaded records: a file that reaches one must also reach the serializer. */
export const RECORD_READER_PORT_FILES = [
  join(MODULES, 'documents', 'application', 'Documents.port.ts'),
];
export const INTERNAL_COPY_FILES = [
  // Loads documents for the application services, which serialize them.
  join(MODULES, 'documents', 'adapters', 'KyselyDocument.repository.ts'),
  // Reads an account's public id and display name; no record.
  join(MODULES, 'documents', 'adapters', 'PrismaPresenceAccount.adapter.ts'),
  // Reads only a row version and returns presence entries.
  join(MODULES, 'documents', 'application', 'Presence.service.ts'),
  // Module wiring: binds the port, reads no record.
  join(MODULES, 'documents', 'Documents.module.ts'),
  join(MODULES, 'documents', 'application', 'Publish.service.ts'),
  join(MODULES, 'documents', 'domain', 'TreeCloner.rules.ts'),
  join(MODULES, 'documents', 'application', 'Bulk.service.ts'),
];

export const VALUE_KIND_SWITCH_FILES = [
  join(MODULES, 'access', 'domain', 'Conditions.rules.ts'),
  join(MODULES, 'documents', 'domain', 'DocumentFilter.rules.ts'),
];

export const REVIEWER_SERVICE_FILE = join(
  MODULES,
  'reviewer',
  'reviewer.service.ts',
);
export const ACCOUNT_VERSION_REPOSITORY_FILE = join(
  MODULES,
  'access',
  'adapters',
  'PrismaAccountVersion.repository.ts',
);

export const SECURITY_AUDIT_MODULE_FILE = join(
  MODULES,
  'security-audit',
  'SecurityAudit.module.ts',
);

export const SYSTEM_ROLES_TABLE_FILE = join(
  MODULES,
  'access',
  'roles',
  'system-roles.ts',
);
export const NON_ROLE_LITERAL_FILES = [
  join(MODULES, 'identity', 'identity.routes.ts'),
  join(MODULES, 'reviewer', 'reviewer.routes.ts'),
  join('architecture', 'module-edges.constants.ts'),
  join('architecture', 'public-handlers.constants.ts'),
  join('architecture', 'source-paths.constants.ts'),
];

/** Files and folders the specs above need to exist, checked on every run. */
export const PINNED_PATHS: readonly string[] = [
  CONTENT_ENGINE_DIRECTORY,
  IDENTITY_DIRECTORY,
  FIELD_TYPES_DIRECTORY,
  GRAPHQL_DIRECTORY,
  ...UNMASKED_FILES,
  RECORD_LOADER_CONSUMER_FILE,
  RECORD_SERIALIZER_FILE,
  ACCESS_CONSTANTS_FILE,
  ...RECORD_READER_PORT_FILES,
  ...INTERNAL_COPY_FILES,
  ...VALUE_KIND_SWITCH_FILES,
  REVIEWER_SERVICE_FILE,
  ACCOUNT_VERSION_REPOSITORY_FILE,
  SECURITY_AUDIT_MODULE_FILE,
  SYSTEM_ROLES_TABLE_FILE,
  ...NON_ROLE_LITERAL_FILES,
];

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
  'field-types',
);
export const GRAPHQL_DIRECTORY = join(MODULES, 'graphql');

export const CONTENT_REPOSITORY_FILE = join(
  MODULES,
  'content-engine',
  'content.repository.ts',
);
export const TREE_LOADER_FILE = join(
  MODULES,
  'content-engine',
  'tree-loader.ts',
);
export const FIELD_PROJECTION_FILE = join(
  MODULES,
  'access',
  'field-projection.ts',
);
export const RECORD_LOADER_FILES = [CONTENT_REPOSITORY_FILE, TREE_LOADER_FILE];
/** Files that bypass masking: no module facade re-exports them. */
export const UNMASKED_FILES = [...RECORD_LOADER_FILES, FIELD_PROJECTION_FILE];

export const RECORD_SERIALIZER_FILE = join(
  MODULES,
  'access',
  'record.serializer.ts',
);
export const ACCESS_CONSTANTS_FILE = join(
  MODULES,
  'access',
  'access.constants.ts',
);
export const INTERNAL_COPY_FILES = [
  join(MODULES, 'documents', 'publish.service.ts'),
  join(MODULES, 'documents', 'tree-cloner.ts'),
  join(MODULES, 'documents', 'bulk.service.ts'),
];

export const VALUE_KIND_SWITCH_FILES = [
  join(MODULES, 'access', 'conditions.compiler.ts'),
  join(MODULES, 'documents', 'document-filter.ts'),
];

export const REVIEWER_SERVICE_FILE = join(
  MODULES,
  'reviewer',
  'reviewer.service.ts',
);
export const VERSION_CACHE_FILE = join(MODULES, 'access', 'version-cache.ts');

export const SECURITY_AUDIT_MODULE_FILE = join(
  MODULES,
  'security-audit',
  'security-audit.module.ts',
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
  RECORD_SERIALIZER_FILE,
  ACCESS_CONSTANTS_FILE,
  ...INTERNAL_COPY_FILES,
  ...VALUE_KIND_SWITCH_FILES,
  REVIEWER_SERVICE_FILE,
  VERSION_CACHE_FILE,
  SECURITY_AUDIT_MODULE_FILE,
  SYSTEM_ROLES_TABLE_FILE,
  ...NON_ROLE_LITERAL_FILES,
];

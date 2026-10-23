/**
 * Allowed import directions between cms-api modules. Mirrors the cms-api
 * rows of the SPEC §2 capability map row for row: a change to one is a
 * change to the other. `modules.architecture.spec.ts` enforces it.
 */
export const MODULE_NODES = [
  'platform',
  'content-engine',
  'health',
  'access-core',
  'security-audit',
  'identity',
  'access-management',
  'access-document-auth',
  'content-types',
  'media',
  'documents',
  'graphql',
  'reviewer',
] as const;

export type ModuleNode = (typeof MODULE_NODES)[number];

export const ALLOWED_MODULE_EDGES: Record<ModuleNode, readonly ModuleNode[]> = {
  platform: [],
  'content-engine': ['platform'],
  health: ['platform'],
  'access-core': ['platform', 'content-engine'],
  'security-audit': ['platform', 'access-core'],
  identity: ['platform', 'access-core', 'security-audit'],
  'access-management': [
    'platform',
    'access-core',
    'identity',
    'security-audit',
  ],
  'access-document-auth': ['platform', 'access-core', 'identity'],
  'content-types': ['platform', 'content-engine', 'access-core', 'identity'],
  media: [
    'platform',
    'content-engine',
    'access-core',
    'identity',
    'security-audit',
  ],
  documents: [
    'platform',
    'content-engine',
    'access-core',
    'access-document-auth',
    'media',
  ],
  graphql: [
    'platform',
    'content-engine',
    'access-core',
    'access-document-auth',
    'documents',
  ],
  reviewer: ['platform', 'access-core', 'identity', 'security-audit'],
};

/** Folders under `src/` that make up the `platform` node. */
export const PLATFORM_DIRECTORIES = [
  'common',
  'config',
  'infrastructure',
  'generated',
] as const;

export const MODULES_DIRECTORY = 'modules';
export const ACCESS_MODULE_DIRECTORY = 'access';
export const ACCESS_MANAGEMENT_DIRECTORY = 'management';

/**
 * Files of `modules/access/` that belong to the management node before
 * R1-10 moves them into `access/management/`. Remove with R1-10.
 */
export const PRE_SPLIT_MANAGEMENT_FILE =
  /^(?:accounts|roles|api-tokens|access-management)[.-]/;

/** Files of `modules/access/` that are the document-auth node (R1-12). */
export const DOCUMENT_AUTH_FILE = /^document-auth\./;

/**
 * Edges the code still has but the table does not allow. Each later R1 task
 * removes its entries; R1-14 ends with the list empty. A file-level entry
 * stays valid only while that exact import exists.
 */
export interface KnownViolation {
  /** Path relative to `src/`. */
  from: string;
  /** Path relative to `src/`. */
  to: string;
  removedBy: string;
}

export const KNOWN_VIOLATIONS: readonly KnownViolation[] = [
  {
    from: 'modules/access/api-token.guard.ts',
    to: 'modules/access/api-tokens.constants.ts',
    removedBy: 'R1-10',
  },
  {
    from: 'modules/access/rank-rules.ts',
    to: 'modules/access/access-management.constants.ts',
    removedBy: 'R1-05',
  },
  {
    from: 'modules/documents/document-auth.guard.ts',
    to: 'modules/access/api-tokens.constants.ts',
    removedBy: 'R1-12',
  },
  {
    from: 'modules/documents/document-auth.guard.ts',
    to: 'modules/identity/jwt.strategy.ts',
    removedBy: 'R1-12',
  },
  {
    from: 'modules/documents/documents.module.ts',
    to: 'modules/identity/identity.module.ts',
    removedBy: 'R1-12',
  },
  {
    from: 'modules/graphql/graphql.module.ts',
    to: 'modules/identity/identity.module.ts',
    removedBy: 'R1-12',
  },
  {
    from: 'modules/media/media-refs.service.ts',
    to: 'modules/documents/documents.constants.ts',
    removedBy: 'R1-13',
  },
];

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

/**
 * SPEC §2 "types only": every import these nodes take from the target node
 * is an `import type`, so it is erased at build time and adds no runtime edge.
 */
export const TYPES_ONLY_EDGES: readonly { from: ModuleNode; to: ModuleNode }[] =
  [{ from: 'security-audit', to: 'access-core' }];

/**
 * SPEC §2 "auth guard only": these nodes import from `identity` the JWT guard
 * and the request type it fills in, and nothing else.
 */
export const AUTH_GUARD_ONLY_NODES: readonly ModuleNode[] = [
  'content-types',
  'media',
];
export const AUTH_GUARD_ONLY_NAMES: readonly string[] = [
  'JwtAuthGuard',
  'AuthenticatedRequest',
];

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

/** The folder of `modules/access/` that is the document-auth node (R1-12). */
export const ACCESS_DOCUMENT_AUTH_DIRECTORY = 'document-auth';

/**
 * Edges the code still has but the table does not allow. Each later R1 task
 * removes its entries; R1-14 ends with the list empty. A file-level entry
 * stays valid only while that exact import exists. A facade is followed, so
 * an edge through `index.ts` is listed for both the facade and the real file.
 */
export interface KnownViolation {
  /** Path relative to `src/`. */
  from: string;
  /** Path relative to `src/`. */
  to: string;
  removedBy: string;
}

export const KNOWN_VIOLATIONS: readonly KnownViolation[] = [];

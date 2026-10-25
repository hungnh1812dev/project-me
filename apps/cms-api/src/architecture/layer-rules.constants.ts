import { join, sep } from 'node:path';

import type { FileLayer } from './module-graph';
import { FIELD_PROJECTION_FILE } from './source-paths.constants';

/**
 * Import rules per layer (ADR 0006 §2, §7). Mirrors the layer bullet of
 * SPEC §2: a change to one is a change to the other.
 * `layers.architecture.spec.ts` enforces it on the modules in
 * `MIGRATED_MODULES`.
 */
export type LayerName = Exclude<FileLayer, 'wiring' | 'unlayered'>;

/** What a platform file is for, by folder (ADR 0006 §7.6). */
export type PlatformRole =
  | 'pure'
  | 'pipeline'
  | 'port'
  | 'adapter'
  | 'scheduling'
  | 'config'
  | 'generated';

export const PLATFORM_ROLE_FOLDERS: readonly {
  /** Path prefix relative to `src/`. */
  prefix: string;
  role: PlatformRole;
}[] = [
  { prefix: join('common', 'constants'), role: 'pure' },
  { prefix: join('common', 'errors'), role: 'pure' },
  { prefix: join('common', 'time'), role: 'pure' },
  { prefix: join('common', 'types'), role: 'pure' },
  { prefix: join('common', 'validation'), role: 'pure' },
  { prefix: join('common', 'http'), role: 'pipeline' },
  { prefix: join('common', 'middleware'), role: 'pipeline' },
  { prefix: join('common', 'filters'), role: 'pipeline' },
  { prefix: join('common', 'guards'), role: 'pipeline' },
  { prefix: join('common', 'rate-limit'), role: 'pipeline' },
  { prefix: 'config', role: 'config' },
  { prefix: 'generated', role: 'generated' },
  { prefix: 'infrastructure', role: 'adapter' },
  { prefix: join('infrastructure', 'scheduling'), role: 'scheduling' },
];

/** A file under `infrastructure/` with this suffix is a port, not an adapter. */
export const PLATFORM_PORT_SUFFIX = '.port.ts';
export const INFRASTRUCTURE_FOLDER = 'infrastructure';

/** Pure packages `domain/` may use; every I/O package stays banned. */
export const ALLOWED_DOMAIN_PACKAGES: readonly string[] = [
  'zod',
  'sanitize-html',
];
/** Deterministic Node built-ins `domain/` may use, limited to these names. */
export const ALLOWED_DOMAIN_BUILTIN_IMPORTS: Readonly<
  Record<string, readonly string[]>
> = { 'node:crypto': ['createHash'] };

/**
 * Values `domain/` may import from another module's facade; every other
 * import from another module is `import type`.
 */
export const DOMAIN_CROSS_MODULE_HELPERS: readonly string[] = [
  'isComponentField',
];

export interface BannedText {
  pattern: RegExp;
  label: string;
}

export const BANNED_ENV_READ: BannedText = {
  pattern: /\bprocess\.env\b/,
  label: 'process.env',
};
export const BANNED_CLOCK_READS: readonly BannedText[] = [
  { pattern: /\bnew Date\(\s*\)/, label: 'new Date()' },
  { pattern: /\bDate\.now\(/, label: 'Date.now(' },
];

export interface LayerRule {
  mayImportOwnLayers: readonly LayerName[];
  /** Layers of another module's files that this layer may reach through its facade. */
  mayImportOtherModuleLayers: readonly FileLayer[];
  /** `'any'`, or the only value names allowed from another module (the rest must be `import type`). */
  otherModuleValueImports: 'any' | readonly string[];
  mayImportPlatform: readonly PlatformRole[];
  /** `null`: any package that is not banned. */
  allowedPackages: readonly string[] | null;
  /** A package outside `allowedPackages` allowed for these names only (an `'all'` form fails). */
  allowedPackageNames: Readonly<Record<string, readonly string[]>>;
  bannedPackages: readonly RegExp[];
  /** A banned package whose imports are limited to these names (an `'all'` form fails). */
  allowedNamedImports: Readonly<Record<string, readonly string[]>>;
  bannedText: readonly BannedText[];
}

const NEST = /^@nestjs\//;
const EXPRESS = /^express(\/|$)/;
const PRISMA = /^@prisma\//;
const KYSELY = /^kysely(\/|$)/;
const PG = /^pg(\/|$)/;
const PASSPORT = /^passport/;

const DATABASE_PACKAGES = [PRISMA, KYSELY, PG];
const NEST_INJECTION = ['Injectable', 'Inject'];
const JOB_NEST_NAMES = [
  ...NEST_INJECTION,
  'Logger',
  'OnModuleInit',
  'OnModuleDestroy',
  'OnApplicationBootstrap',
  'OnApplicationShutdown',
];
const UNBANNED = {
  otherModuleValueImports: 'any',
  allowedPackages: null,
  allowedPackageNames: {},
  allowedNamedImports: {},
  bannedText: [],
} as const;
const CORE_LAYERS: readonly FileLayer[] = ['domain', 'application', 'wiring'];

export const LAYER_RULES: Readonly<Record<LayerName, LayerRule>> = {
  domain: {
    mayImportOwnLayers: ['domain'],
    mayImportOtherModuleLayers: CORE_LAYERS,
    otherModuleValueImports: DOMAIN_CROSS_MODULE_HELPERS,
    mayImportPlatform: ['pure'],
    allowedPackages: ALLOWED_DOMAIN_PACKAGES,
    allowedPackageNames: ALLOWED_DOMAIN_BUILTIN_IMPORTS,
    bannedPackages: [],
    allowedNamedImports: {},
    bannedText: [BANNED_ENV_READ, ...BANNED_CLOCK_READS],
  },
  application: {
    ...UNBANNED,
    mayImportOwnLayers: ['domain', 'application'],
    mayImportOtherModuleLayers: CORE_LAYERS,
    mayImportPlatform: ['pure', 'port', 'config'],
    bannedPackages: [NEST, EXPRESS, ...DATABASE_PACKAGES, PASSPORT],
    allowedNamedImports: { '@nestjs/common': NEST_INJECTION },
    bannedText: [BANNED_ENV_READ, ...BANNED_CLOCK_READS],
  },
  adapters: {
    ...UNBANNED,
    mayImportOwnLayers: ['domain', 'application', 'adapters'],
    mayImportOtherModuleLayers: CORE_LAYERS,
    mayImportPlatform: ['pure', 'port', 'adapter', 'config', 'generated'],
    bannedPackages: [],
  },
  http: {
    ...UNBANNED,
    mayImportOwnLayers: ['domain', 'application', 'http'],
    mayImportOtherModuleLayers: [...CORE_LAYERS, 'http'],
    mayImportPlatform: ['pure', 'pipeline', 'config'],
    bannedPackages: DATABASE_PACKAGES,
  },
  cli: {
    ...UNBANNED,
    mayImportOwnLayers: ['domain', 'application', 'adapters', 'cli'],
    mayImportOtherModuleLayers: [...CORE_LAYERS, 'adapters'],
    mayImportPlatform: ['pure', 'port', 'adapter', 'config', 'generated'],
    bannedPackages: [],
  },
  jobs: {
    ...UNBANNED,
    mayImportOwnLayers: ['domain', 'application', 'jobs'],
    mayImportOtherModuleLayers: CORE_LAYERS,
    mayImportPlatform: ['pure', 'config', 'scheduling'],
    bannedPackages: [NEST, EXPRESS, ...DATABASE_PACKAGES, PASSPORT],
    allowedNamedImports: { '@nestjs/common': JOB_NEST_NAMES },
  },
};

/**
 * An import a layer rule would reject but the design allows on purpose.
 * `importing` is a package name or a path relative to `src/`; `from` is a
 * file path, or a folder prefix ending in a separator.
 */
export interface LayerException {
  from: string;
  importing: string;
  reason: string;
}

export const LAYER_EXCEPTIONS: readonly LayerException[] = [
  {
    from: join('modules', 'access', 'domain', 'PolicyEvaluator.ts'),
    importing: 'kysely',
    reason:
      'Q-CA17: row filters are Kysely expressions; other modules see the opaque RowFilter type',
  },
  {
    from: join('modules', 'access', 'domain', 'Conditions.rules.ts'),
    importing: 'kysely',
    reason: 'Q-CA17: same exception as PolicyEvaluator.ts',
  },
  {
    from: join('modules', 'documents') + sep,
    importing: FIELD_PROJECTION_FILE,
    reason:
      'SPEC D3: documents reads the field projection by file, not through the access facade',
  },
];

/**
 * Folders under `src/` that read module constants by file and are not
 * module code, so the layer rules never apply to them.
 */
export const LAYER_EXEMPT_ROOTS: readonly string[] = [
  'architecture',
  'contract',
];

/** Module folders (`modules/<name>`) the layer guard checks. Each CR task adds its module. */
export const MIGRATED_MODULES: readonly string[] = [
  'health',
  'content-types',
  'content-engine',
];

export interface KnownLayerViolation {
  /** Path relative to `src/`. */
  from: string;
  rule: string;
  /** Package or path the violation names; omit to match any. */
  to?: string;
  removedBy: string;
}

/** Violations a migrated module still has; a stale entry fails the spec. */
export const KNOWN_LAYER_VIOLATIONS: readonly KnownLayerViolation[] = [];

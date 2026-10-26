/**
 * ADR 0008 / SPEC §5: file names are `<PascalName>.<function>.ts`. This file
 * is the one place that lists the allowed function words. A new function word
 * is one entry in `FILE_FUNCTION_WORDS`.
 */
export const FILE_FUNCTION_WORDS: readonly string[] = [
  'setup',
  'module',
  'controller',
  'requests',
  'routes',
  'guard',
  'decorator',
  'middleware',
  'filter',
  'service',
  'port',
  'entity',
  'rules',
  'errors',
  'repository',
  'adapter',
  'client',
  'command',
  'job',
  'store',
  'strategy',
  'resolver',
  'executor',
  'constants',
  'fixture',
  'architecture',
  'analyzer',
  'integration',
  'contract',
  'schema',
];

/** Names fixed by a framework or tool, kept as they are. */
export const FRAMEWORK_FILE_NAMES: readonly string[] = ['index.ts', 'main.ts'];

/** Directories under the package root that the guard scans. */
export const SCANNED_DIRECTORIES: readonly string[] = ['src', 'test'];

/** Generated code is not named by hand. */
export const SKIPPED_DIRECTORIES: readonly string[] = ['src/generated'];

export const FOLDER_NAME_SHAPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

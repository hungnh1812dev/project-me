import { join, resolve } from 'node:path';

/**
 * `apps/cms-api/content`, resolved from this file. `src/` and `dist/` sit at
 * the same depth, so the path works for ts-jest and for the built CLI.
 */
const CONTENT_ROOT = resolve(__dirname, '..', '..', '..', '..', 'content');

export const DEFAULT_CONTENT_PATHS = {
  schemasDir: join(CONTENT_ROOT, 'schemas'),
  migrationsDir: join(CONTENT_ROOT, 'migrations'),
} as const;

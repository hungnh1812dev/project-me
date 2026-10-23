import { join } from 'node:path';

import {
  listSourceFiles,
  packageSpecifiersOf,
  reachedFilesOf,
} from '../../architecture/import-graph';

/**
 * SPEC D18 / D3: GraphQL reads go through `DocumentsQueryService` only, so
 * masking cannot be bypassed. No file here reaches a record loader or the
 * field projection (checked on resolved files, facades followed), and none
 * imports Kysely.
 */
const SRC_ROOT = join(__dirname, '..', '..');
const GRAPHQL_DIR = join('modules', 'graphql');
const FORBIDDEN_FILES = [
  join('modules', 'content-engine', 'content.repository.ts'),
  join('modules', 'content-engine', 'tree-loader.ts'),
  join('modules', 'access', 'field-projection.ts'),
];
const FORBIDDEN_PACKAGE = 'kysely';

describe('graphql module architecture (D18)', () => {
  it('reads documents through DocumentsQueryService only', () => {
    const files = listSourceFiles(join(SRC_ROOT, GRAPHQL_DIR));
    expect(files.length).toBeGreaterThan(5);
    const offenders = files
      .filter(
        (source) =>
          [...reachedFilesOf(SRC_ROOT, source)].some((reached) =>
            FORBIDDEN_FILES.includes(reached),
          ) || packageSpecifiersOf(source).includes(FORBIDDEN_PACKAGE),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the forbidden files exist, so the rule cannot pass on a rename', () => {
    const all = listSourceFiles(SRC_ROOT).map(({ file }) => file);
    expect(FORBIDDEN_FILES.every((file) => all.includes(file))).toBe(true);
  });
});

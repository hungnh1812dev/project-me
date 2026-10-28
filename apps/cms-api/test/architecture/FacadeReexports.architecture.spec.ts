import { basename } from 'node:path';

import {
  assertPinnedPathsExist,
  listSourceFiles,
  reachedFilesOf,
} from './ImportGraph.analyzer';
import {
  MODULES_PREFIX,
  UNMASKED_FILES,
  SRC_ROOT,
} from './SourcePaths.constants';

/**
 * SPEC D3 / D18: a module facade (`index.ts`) never re-exports the record
 * loaders or the field projection. Those files bypass masking, so only the
 * modules the other architecture specs name may import them by file.
 */
const FACADE_FILE = 'index.ts';

describe('module facades (D3, D18)', () => {
  const sources = listSourceFiles(SRC_ROOT);

  it('scans the source tree and the files the rule protects', () => {
    expect(sources.length).toBeGreaterThan(0);
    assertPinnedPathsExist(SRC_ROOT, UNMASKED_FILES);
  });

  it('no module index.ts re-exports an unmasked file', () => {
    const offenders = sources
      .filter(
        ({ file }) =>
          file.startsWith(MODULES_PREFIX) && basename(file) === FACADE_FILE,
      )
      .filter((source) =>
        [...reachedFilesOf(SRC_ROOT, source)].some((reached) =>
          UNMASKED_FILES.includes(reached),
        ),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

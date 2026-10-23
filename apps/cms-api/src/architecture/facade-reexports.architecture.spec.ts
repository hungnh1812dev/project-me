import { basename, join } from 'node:path';

import { listSourceFiles, reachedFilesOf } from './import-graph';

/**
 * SPEC D3 / D18: a module facade (`index.ts`) never re-exports the record
 * loaders or the field projection. Those files bypass masking, so only the
 * modules the other architecture specs name may import them by file.
 */
const SRC_ROOT = join(__dirname, '..');
const FACADE_FILE = 'index.ts';
const MODULES_DIR = join('modules') + '/';
const UNMASKED_FILES = [
  join('modules', 'content-engine', 'content.repository.ts'),
  join('modules', 'content-engine', 'tree-loader.ts'),
  join('modules', 'access', 'field-projection.ts'),
];

describe('module facades (D3, D18)', () => {
  const sources = listSourceFiles(SRC_ROOT);

  it('scans the source tree and the files the rule protects', () => {
    expect(sources.length).toBeGreaterThan(0);
    const all = sources.map(({ file }) => file);
    expect(UNMASKED_FILES.every((file) => all.includes(file))).toBe(true);
  });

  it('no module index.ts re-exports an unmasked file', () => {
    const offenders = sources
      .filter(
        ({ file }) =>
          file.startsWith(MODULES_DIR) && basename(file) === FACADE_FILE,
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

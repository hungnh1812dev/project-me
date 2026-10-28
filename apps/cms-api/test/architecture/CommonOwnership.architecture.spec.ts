import { sep } from 'node:path';

import { listSourceFiles, reachedFilesOf } from './ImportGraph.analyzer';
import { nodeOfFile } from './ModuleGraph.analyzer';
import { SRC_ROOT } from './SourcePaths.constants';

/**
 * SPEC D1 (R1-15): `common/` and `infrastructure/` hold what several modules
 * share. A file there (a port or an adapter too) that only one module imports
 * belongs in that module. Files that still wait for their move are in
 * `SINGLE_MODULE_ALLOWLIST` with the task that moves them; a listed file that
 * no longer qualifies fails the spec.
 */
const SHARED_DIRECTORIES = ['common', 'infrastructure'];

const SINGLE_MODULE_ALLOWLIST = new Map<string, string>();

describe('common/ and infrastructure/ ownership (D1)', () => {
  const sources = listSourceFiles(SRC_ROOT);
  const commonFiles = sources
    .map(({ file }) => file)
    .filter((file) =>
      SHARED_DIRECTORIES.some((directory) =>
        file.startsWith(`${directory}${sep}`),
      ),
    );

  /** Who imports each common file: a module node, or 'shared' for any other importer. */
  const importersOf = new Map<string, Set<string>>();
  for (const source of sources) {
    const importer = nodeOfFile(source.file);
    const label =
      importer === null || importer === 'platform' ? 'shared' : importer;
    for (const reached of reachedFilesOf(SRC_ROOT, source)) {
      if (!commonFiles.includes(reached) || reached === source.file) continue;
      importersOf.set(
        reached,
        (importersOf.get(reached) ?? new Set()).add(label),
      );
    }
  }

  const singleModuleFiles = commonFiles.filter((file) => {
    const importers = importersOf.get(file);
    return importers?.size === 1 && !importers.has('shared');
  });

  it('scans common/ and infrastructure/', () => {
    expect(commonFiles.length).toBeGreaterThan(0);
    expect(importersOf.size).toBeGreaterThan(0);
  });

  it('has no file that only one module imports', () => {
    const unlisted = singleModuleFiles.filter(
      (file) => !SINGLE_MODULE_ALLOWLIST.has(file),
    );
    expect(unlisted).toEqual([]);
  });

  it('lists only files that are still single-module', () => {
    const stale = [...SINGLE_MODULE_ALLOWLIST.keys()].filter(
      (file) => !singleModuleFiles.includes(file),
    );
    expect(stale).toEqual([]);
  });
});

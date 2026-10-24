import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import * as sessionFacade from './features/session';

const SRC_DIR = import.meta.dirname;
const FEATURES_DIR = resolve(SRC_DIR, 'features');
const RELATIVE_IMPORT = /from\s+'(\.[^']*)'/g;
const TEST_FILE = /\.test\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;

function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFilesIn(path);
    return SOURCE_FILE.test(entry) && !TEST_FILE.test(entry) ? [path] : [];
  });
}

/** The first folder under src/ that holds the file: `features/auth`, `app`, `lib`. */
function directoryOf(file: string): string {
  const [first = '', second = ''] = file.slice(SRC_DIR.length + 1).split('/');
  return first === 'features' ? `features/${second}` : first;
}

function importedDirectories(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)].flatMap(
    ([, specifier = '']) => {
      const target = resolve(file, '..', specifier);
      return target.startsWith(`${SRC_DIR}/`) ? [directoryOf(target)] : [];
    },
  );
}

// config <-> lib already import each other (strip-trailing-slashes); that cycle
// is not part of this guard, which covers features and app.
const isFeatureOrApp = (directory: string) =>
  directory === 'app' || directory.startsWith('features/');

function dependencyGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of sourceFilesIn(SRC_DIR)) {
    const from = directoryOf(file);
    if (!isFeatureOrApp(from)) continue;
    const targets = graph.get(from) ?? new Set<string>();
    importedDirectories(file)
      .filter((to) => to !== from && isFeatureOrApp(to))
      .forEach((to) => targets.add(to));
    graph.set(from, targets);
  }
  return graph;
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const visit = (node: string, path: string[]): string[] | null => {
    if (path.includes(node)) return [...path.slice(path.indexOf(node)), node];
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next, [...path, node]);
      if (cycle !== null) return cycle;
    }
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node, []);
    if (cycle !== null) return cycle;
  }
  return null;
}

describe('directory dependencies', () => {
  it('have no cycle between directories', () => {
    expect(findCycle(dependencyGraph())).toBeNull();
  });

  it('keep auth and reviewer independent of each other', () => {
    const graph = dependencyGraph();
    expect(graph.get('features/auth')).not.toContain('features/reviewer');
    expect(graph.get('features/reviewer')).not.toContain('features/auth');
  });
});

describe('session facade', () => {
  it('exposes only the provider, the hook and the privileged error at runtime', () => {
    expect(Object.keys(sessionFacade).sort()).toEqual([
      'PrivilegedAccessError',
      'WebSessionProvider',
      'useWebSession',
    ]);
  });

  it('exports no test utility', () => {
    const facadeSource = readFileSync(
      join(FEATURES_DIR, 'session', 'index.ts'),
      'utf8',
    );
    expect(facadeSource).not.toMatch(/test-utils/);
  });
});

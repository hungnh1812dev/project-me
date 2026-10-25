import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  collectCrossNodeEdges,
  collectNodeImports,
  layerOfFile,
  nodeOfFile,
  SRC_ROOT,
  type NodeImport,
} from './module-graph';
import {
  authGuardOnlyViolations,
  typesOnlyViolations,
} from './module-sub-rules';
import {
  ALLOWED_MODULE_EDGES,
  KNOWN_VIOLATIONS,
  MODULES_DIRECTORY,
  MODULE_NODES,
  type ModuleNode,
} from './module-edges.constants';

/**
 * SPEC §2 module directions: a file may import another module only when the
 * edge is in `ALLOWED_MODULE_EDGES`, and there are no cycles. Edges the code
 * still has are listed in `KNOWN_VIOLATIONS` until the R1 task that removes
 * them. Imports are resolved to real files (facades followed).
 */
const isAllowed = (from: ModuleNode, to: ModuleNode) =>
  ALLOWED_MODULE_EDGES[from].includes(to);

const edgeLabel = (from: string, to: string) => `${from} -> ${to}`;

function findCycle(
  edgesOf: (node: ModuleNode) => readonly ModuleNode[],
): ModuleNode[] | null {
  const visiting: ModuleNode[] = [];
  const done = new Set<ModuleNode>();
  const visit = (node: ModuleNode): ModuleNode[] | null => {
    const index = visiting.indexOf(node);
    if (index >= 0) return [...visiting.slice(index), node];
    if (done.has(node)) return null;
    visiting.push(node);
    for (const next of edgesOf(node)) {
      const cycle = visit(next);
      if (cycle !== null) return cycle;
    }
    visiting.pop();
    done.add(node);
    return null;
  };
  for (const node of MODULE_NODES) {
    const cycle = visit(node);
    if (cycle !== null) return cycle;
  }
  return null;
}

describe('module dependency guard (SPEC §2)', () => {
  const { scannedFiles, edges } = collectCrossNodeEdges(SRC_ROOT);
  const knownKeys = new Set(
    KNOWN_VIOLATIONS.map(({ from, to }) => edgeLabel(from, to)),
  );
  const disallowed = edges.filter(
    ({ fromNode, toNode }) => !isAllowed(fromNode, toNode),
  );

  it('scans the source tree and finds module edges', () => {
    expect(scannedFiles).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('lists only declared nodes in the allowed-edges table', () => {
    for (const node of MODULE_NODES) {
      expect(
        ALLOWED_MODULE_EDGES[node].every((to) => to in ALLOWED_MODULE_EDGES),
      ).toBe(true);
    }
  });

  it('has no cycle in the allowed-edges table', () => {
    expect(findCycle((node) => ALLOWED_MODULE_EDGES[node])).toBeNull();
  });

  it('has no import outside the allowed edges except known violations', () => {
    const unexpected = disallowed
      .filter(({ from, to }) => !knownKeys.has(edgeLabel(from, to)))
      .map(({ from, to }) => edgeLabel(from, to));
    expect(unexpected).toEqual([]);
  });

  it('has no stale known violation', () => {
    const present = new Set(
      disallowed.map(({ from, to }) => edgeLabel(from, to)),
    );
    const stale = [...knownKeys].filter((key) => !present.has(key));
    expect(stale).toEqual([]);
  });

  it('has no cycle between nodes once known violations are set aside', () => {
    const live = edges.filter(
      ({ from, to }) => !knownKeys.has(edgeLabel(from, to)),
    );
    const cycle = findCycle((node) => [
      ...new Set(
        live
          .filter(({ fromNode }) => fromNode === node)
          .map(({ toNode }) => toNode),
      ),
    ]);
    expect(cycle).toBeNull();
  });
});

describe('module facades (SPEC §2)', () => {
  const modulesDirectory = join(SRC_ROOT, MODULES_DIRECTORY);
  const moduleFolders = readdirSync(modulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('every module folder has an index.ts', () => {
    expect(moduleFolders.length).toBeGreaterThan(0);
    const withoutFacade = moduleFolders.filter(
      (name) => !existsSync(join(modulesDirectory, name, 'index.ts')),
    );
    expect(withoutFacade).toEqual([]);
  });
});

describe('module sub-rules (SPEC §2)', () => {
  const imports = collectNodeImports(SRC_ROOT);

  const importOf = (overrides: Partial<NodeImport>): NodeImport => ({
    file: 'modules/x/file.ts',
    fromNode: 'media',
    toNodes: ['identity'],
    importedNames: ['JwtAuthGuard'],
    isTypeOnly: false,
    ...overrides,
  });

  it('scans the source tree and finds node imports', () => {
    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.some(
        ({ fromNode, toNodes }) =>
          fromNode === 'security-audit' && toNodes.includes('access-core'),
      ),
    ).toBe(true);
    expect(
      imports.some(
        ({ fromNode, toNodes }) =>
          fromNode === 'media' && toNodes.includes('identity'),
      ),
    ).toBe(true);
  });

  it('security-audit imports access core with `import type` only', () => {
    expect(typesOnlyViolations(imports)).toEqual([]);
  });

  it('content-types and media import only the JWT guard from identity', () => {
    expect(authGuardOnlyViolations(imports)).toEqual([]);
  });

  it('the types-only rule catches a value import and accepts a type import', () => {
    const edge: Partial<NodeImport> = {
      fromNode: 'security-audit',
      toNodes: ['access-core'],
    };
    expect(typesOnlyViolations([importOf({ ...edge })])).toHaveLength(1);
    expect(
      typesOnlyViolations([importOf({ ...edge, isTypeOnly: true })]),
    ).toEqual([]);
  });

  it('the auth-guard-only rule catches other identity names and wildcard forms', () => {
    expect(
      authGuardOnlyViolations([
        importOf({ importedNames: ['IdentityModule'] }),
      ]),
    ).toHaveLength(1);
    expect(
      authGuardOnlyViolations([importOf({ importedNames: 'all' })]),
    ).toHaveLength(1);
    expect(
      authGuardOnlyViolations([
        importOf({ importedNames: ['JwtAuthGuard', 'AuthenticatedRequest'] }),
      ]),
    ).toEqual([]);
  });
});

describe('layers and nodes of module files (ADR 0006 §2)', () => {
  const at = (...parts: string[]) => join(...parts);

  it('reads the layer from the folder right after the module name', () => {
    expect(layerOfFile(at('modules', 'media', 'domain', 'x.ts'))).toBe(
      'domain',
    );
    expect(layerOfFile(at('modules', 'media', 'application', 'x.ts'))).toBe(
      'application',
    );
    expect(layerOfFile(at('modules', 'media', 'adapters', 'a', 'x.ts'))).toBe(
      'adapters',
    );
    expect(layerOfFile(at('modules', 'media', 'http', 'x.ts'))).toBe('http');
    expect(layerOfFile(at('modules', 'identity', 'cli', 'x.ts'))).toBe('cli');
    expect(layerOfFile(at('modules', 'documents', 'jobs', 'x.ts'))).toBe(
      'jobs',
    );
  });

  it('treats module-root index.ts and *.module.ts as wiring, other files as unlayered', () => {
    expect(layerOfFile(at('modules', 'media', 'index.ts'))).toBe('wiring');
    expect(layerOfFile(at('modules', 'media', 'Media.module.ts'))).toBe(
      'wiring',
    );
    expect(layerOfFile(at('modules', 'media', 'media.service.ts'))).toBe(
      'unlayered',
    );
    expect(layerOfFile(at('modules', 'media', 'roles', 'x.ts'))).toBe(
      'unlayered',
    );
    expect(layerOfFile(at('common', 'http', 'x.ts'))).toBe('unlayered');
  });

  it('gives access management its own layer folders', () => {
    expect(
      layerOfFile(at('modules', 'access', 'management', 'application', 'x.ts')),
    ).toBe('application');
    expect(
      layerOfFile(at('modules', 'access', 'management', 'x.module.ts')),
    ).toBe('wiring');
  });

  it('puts a file in the access node the folder says, with or without a layer folder', () => {
    expect(nodeOfFile(at('modules', 'access', 'application', 'x.ts'))).toBe(
      'access-core',
    );
    expect(nodeOfFile(at('modules', 'access', 'x.ts'))).toBe('access-core');
    expect(
      nodeOfFile(at('modules', 'access', 'management', 'application', 'x.ts')),
    ).toBe('access-management');
    expect(
      nodeOfFile(at('modules', 'access', 'http', 'document-auth.guard.ts')),
    ).toBe('access-document-auth');
    expect(nodeOfFile(at('modules', 'media', 'http', 'x.ts'))).toBe('media');
  });
});

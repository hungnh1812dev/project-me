import { collectCrossNodeEdges, SRC_ROOT } from './module-graph';
import {
  ALLOWED_MODULE_EDGES,
  KNOWN_VIOLATIONS,
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

import {
  AUTH_GUARD_ONLY_NAMES,
  AUTH_GUARD_ONLY_NODES,
  TYPES_ONLY_EDGES,
} from './module-edges.constants';
import type { NodeImport } from './module-graph';

/** SPEC §2 "types only": imports on a types-only edge that are not `import type`. */
export function typesOnlyViolations(imports: readonly NodeImport[]): string[] {
  return imports
    .filter(
      ({ fromNode, toNodes, isTypeOnly }) =>
        !isTypeOnly &&
        TYPES_ONLY_EDGES.some(
          (edge) => edge.from === fromNode && toNodes.includes(edge.to),
        ),
    )
    .map(({ file }) => file);
}

/** SPEC §2 "auth guard only": identity imports of those nodes beyond the guard. */
export function authGuardOnlyViolations(
  imports: readonly NodeImport[],
): string[] {
  return imports
    .filter(
      ({ fromNode, toNodes, importedNames }) =>
        AUTH_GUARD_ONLY_NODES.includes(fromNode) &&
        toNodes.includes('identity') &&
        (importedNames === 'all' ||
          importedNames.some((name) => !AUTH_GUARD_ONLY_NAMES.includes(name))),
    )
    .map(({ file }) => file);
}

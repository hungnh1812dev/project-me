import type { Permission } from './types';

// Pure logic behind `PermissionTree` (AC-23, D3). The tree is built from the P1 catalog only, so it
// needs `permission:read` and nothing else. Selections are plain slug arrays, as R2, R3 and T2 send.

/** One permission the tree can select. */
export interface PermissionTreeLeaf {
  slug: string;
  /** Empty for an unknown slug. */
  name: string;
  description: string | null;
  /** `false` for a selected slug that is not in the catalog. */
  known: boolean;
}

/** A group: a resource, a document sub-group, or the unknown permissions. */
export interface PermissionTreeNode {
  /** `<resource>`, `document:*`, `document:<content type>` or `UNKNOWN_GROUP_ID`. */
  id: string;
  label: string;
  /** Its own leaves, sorted by slug. */
  permissions: PermissionTreeLeaf[];
  /** Sub-groups (only `document` has them). */
  children: PermissionTreeNode[];
}

export type NodeState = 'checked' | 'indeterminate' | 'unchecked';

export const UNKNOWN_GROUP_ID = '__unknown__';
const DOCUMENT = 'document';
const ALL_CONTENT_TYPES = 'All content types';

const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);

/** The text before the first `:` (the whole slug when there is none). */
const resourceOf = (slug: string) => slug.split(':')[0] ?? slug;

const group = (id: string, label: string, permissions: PermissionTreeLeaf[] = []) => ({
  id,
  label,
  permissions,
  children: [] as PermissionTreeNode[],
});

/** Splits the document leaves into "All content types" plus one sub-group per content type (D3). */
function documentChildren(leaves: readonly PermissionTreeLeaf[]): PermissionTreeNode[] {
  const global: PermissionTreeLeaf[] = [];
  const scoped = new Map<string, PermissionTreeLeaf[]>();
  for (const leaf of leaves) {
    const contentType = leaf.slug.split(':').slice(2).join(':');
    if (!contentType) global.push(leaf);
    else scoped.set(contentType, [...(scoped.get(contentType) ?? []), leaf]);
  }
  const children = [...scoped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([contentType, items]) => group(`${DOCUMENT}:${contentType}`, contentType, items));
  return global.length > 0
    ? [group(`${DOCUMENT}:*`, ALL_CONTENT_TYPES, global), ...children]
    : children;
}

/**
 * Builds the tree from the catalog (AC-23): one group per resource, sorted alphabetically, with
 * leaves sorted by slug. `document` holds no leaves itself; it is split into "All content types"
 * (two-segment slugs) and one sub-group per content-type slug (three segments) found in the
 * catalog (D3). Slugs in `selected` that the catalog lacks go last, under "Unknown permissions".
 */
export function buildPermissionTree(
  catalog: readonly Permission[],
  selected: readonly string[] = [],
): PermissionTreeNode[] {
  const byResource = new Map<string, PermissionTreeLeaf[]>();
  for (const permission of [...catalog].sort(bySlug)) {
    const resource = resourceOf(permission.slug);
    const leaf: PermissionTreeLeaf = {
      slug: permission.slug,
      name: permission.name,
      description: permission.description ?? null,
      known: true,
    };
    byResource.set(resource, [...(byResource.get(resource) ?? []), leaf]);
  }
  const tree = [...byResource]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, leaves]) =>
      resource === DOCUMENT
        ? { ...group(resource, resource), children: documentChildren(leaves) }
        : group(resource, resource, leaves),
    );

  const known = new Set(catalog.map((permission) => permission.slug));
  const unknown = [...new Set(selected)]
    .filter((slug) => !known.has(slug))
    .sort()
    .map((slug): PermissionTreeLeaf => ({ slug, name: '', description: null, known: false }));
  if (unknown.length > 0) tree.push(group(UNKNOWN_GROUP_ID, 'Unknown permissions', unknown));
  return tree;
}

/** Every slug under `node`: its own leaves, then its sub-groups', in tree order. */
export function nodeSlugs(node: PermissionTreeNode): string[] {
  return [
    ...node.permissions.map((leaf) => leaf.slug),
    ...node.children.flatMap((child) => nodeSlugs(child)),
  ];
}

/** How many of the node's slugs are selected, out of all of them ("n of m"). */
export function countSelected(
  node: PermissionTreeNode,
  selected: readonly string[],
): { selected: number; total: number } {
  const chosen = new Set(selected);
  const slugs = nodeSlugs(node);
  return { selected: slugs.filter((slug) => chosen.has(slug)).length, total: slugs.length };
}

/** The tri-state of a group checkbox: all, some or none of its slugs selected. */
export function nodeState(node: PermissionTreeNode, selected: readonly string[]): NodeState {
  const { selected: count, total } = countSelected(node, selected);
  if (count === 0) return 'unchecked';
  return count === total ? 'checked' : 'indeterminate';
}

/**
 * Toggles a group: a checked group clears all of its descendants; an unchecked or indeterminate one
 * selects all of them. Other slugs keep their order, and new ones are appended in tree order.
 */
export function toggleNode(node: PermissionTreeNode, selected: readonly string[]): string[] {
  const slugs = nodeSlugs(node);
  if (nodeState(node, selected) === 'checked') {
    const remove = new Set(slugs);
    return selected.filter((slug) => !remove.has(slug));
  }
  const chosen = new Set(selected);
  return [...selected, ...slugs.filter((slug) => !chosen.has(slug))];
}

/** Adds `slug` when it is not selected, removes it when it is. */
export function toggleSlug(selected: readonly string[], slug: string): string[] {
  return selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug];
}

const matches = (leaf: PermissionTreeLeaf, query: string) =>
  [leaf.slug, leaf.name, leaf.description ?? ''].some((value) =>
    value.toLowerCase().includes(query),
  );

/**
 * The tree reduced to the leaves whose slug, name or description contains `query` (trimmed, any
 * case), without the groups left empty. A blank query returns `tree` itself.
 */
export function filterPermissionTree(
  tree: readonly PermissionTreeNode[],
  query: string,
): readonly PermissionTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tree;
  const prune = (node: PermissionTreeNode): PermissionTreeNode | null => {
    const permissions = node.permissions.filter((leaf) => matches(leaf, needle));
    const children = node.children.map(prune).filter((child) => child !== null);
    return permissions.length > 0 || children.length > 0
      ? { ...node, permissions, children }
      : null;
  };
  return tree.map(prune).filter((node) => node !== null);
}

/** A role's slugs grouped by resource, both sorted, for the read-only views (AC-18). */
export function groupSlugsByResource(
  slugs: readonly string[],
): { resource: string; slugs: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const slug of [...slugs].sort()) {
    const resource = resourceOf(slug);
    groups.set(resource, [...(groups.get(resource) ?? []), slug]);
  }
  return [...groups].map(([resource, items]) => ({ resource, slugs: items }));
}

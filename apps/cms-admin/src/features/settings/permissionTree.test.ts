import { describe, expect, it } from 'vitest';

import { makePermission } from '@/test/fixtures';

import {
  buildPermissionTree,
  countSelected,
  filterPermissionTree,
  groupSlugsByResource,
  nodeSlugs,
  nodeState,
  toggleNode,
  toggleSlug,
  UNKNOWN_GROUP_ID,
  type PermissionTreeNode,
} from './permissionTree';

const perm = (slug: string, name = slug, description: string | null = null) =>
  makePermission({ documentId: `id-${slug}`, slug, name, description });

const CATALOG = [
  perm('role:read', 'Read roles', 'List roles.'),
  perm('document:read:page', 'Read pages'),
  perm('document:read', 'Read documents'),
  perm('document:update:article', 'Update articles'),
  perm('document:read:article', 'Read articles'),
  perm('api_token:read', 'Read tokens'),
  perm('role:manager', 'Manage roles'),
];

/** Group ids with their own slugs, depth first, for a readable shape assertion. */
function shape(nodes: readonly PermissionTreeNode[]): [string, string, string[]][] {
  return nodes.flatMap((node) => [
    [node.id, node.label, node.permissions.map((leaf) => leaf.slug)] as [string, string, string[]],
    ...shape(node.children),
  ]);
}

const groupOf = (nodes: readonly PermissionTreeNode[], id: string): PermissionTreeNode => {
  const found = nodes.find((node) => node.id === id);
  if (!found) throw new Error(`no group ${id}`);
  return found;
};

describe('buildPermissionTree (AC-23, D3)', () => {
  it('groups by resource, alphabetically, and splits document by content type', () => {
    expect(shape(buildPermissionTree(CATALOG))).toEqual([
      ['api_token', 'api_token', ['api_token:read']],
      ['document', 'document', []],
      ['document:*', 'All content types', ['document:read']],
      ['document:article', 'article', ['document:read:article', 'document:update:article']],
      ['document:page', 'page', ['document:read:page']],
      ['role', 'role', ['role:manager', 'role:read']],
    ]);
  });

  it('keeps the name and description on each leaf, with null for a missing description', () => {
    const [, , role] = buildPermissionTree(CATALOG);
    expect(role?.permissions).toEqual([
      { slug: 'role:manager', name: 'Manage roles', description: null, known: true },
      { slug: 'role:read', name: 'Read roles', description: 'List roles.', known: true },
    ]);
    const undefinedDescription = makePermission({ slug: 'x:y', description: undefined });
    expect(buildPermissionTree([undefinedDescription])[0]?.permissions[0]?.description).toBe(null);
  });

  it('leaves out an empty "All content types" group', () => {
    const tree = buildPermissionTree([perm('document:read:article')]);
    expect(shape(tree)).toEqual([
      ['document', 'document', []],
      ['document:article', 'article', ['document:read:article']],
    ]);
  });

  it('treats a slug without a colon as its own resource', () => {
    expect(shape(buildPermissionTree([perm('legacy')]))).toEqual([
      ['legacy', 'legacy', ['legacy']],
    ]);
  });

  it('adds selected slugs missing from the catalog under "Unknown permissions", last', () => {
    const tree = buildPermissionTree([perm('role:read')], ['zeta:read', 'role:read', 'alpha:x']);
    expect(shape(tree)).toEqual([
      ['role', 'role', ['role:read']],
      [UNKNOWN_GROUP_ID, 'Unknown permissions', ['alpha:x', 'zeta:read']],
    ]);
    expect(tree[1]?.permissions[0]).toEqual({
      slug: 'alpha:x',
      name: '',
      description: null,
      known: false,
    });
  });

  it('returns an empty tree for an empty catalog and selection', () => {
    expect(buildPermissionTree([])).toEqual([]);
  });
});

describe('nodeSlugs, nodeState and countSelected (AC-23)', () => {
  const tree = buildPermissionTree(CATALOG);
  const documentGroup = groupOf(tree, 'document');

  it('collects every descendant slug of a group', () => {
    expect(nodeSlugs(documentGroup)).toEqual([
      'document:read',
      'document:read:article',
      'document:update:article',
      'document:read:page',
    ]);
  });

  it.each([
    ['unchecked with nothing selected', [], 'unchecked', 0],
    ['indeterminate with some selected', ['document:read', 'role:read'], 'indeterminate', 1],
    [
      'checked with all selected',
      ['document:read', 'document:read:article', 'document:update:article', 'document:read:page'],
      'checked',
      4,
    ],
  ] as const)('is %s', (_, selected, state, count) => {
    expect(nodeState(documentGroup, selected)).toBe(state);
    expect(countSelected(documentGroup, selected)).toEqual({ selected: count, total: 4 });
  });

  it('is unchecked for a group without permissions', () => {
    const empty: PermissionTreeNode = { id: 'e', label: 'e', permissions: [], children: [] };
    expect(nodeState(empty, ['a:b'])).toBe('unchecked');
  });
});

describe('toggleNode and toggleSlug (AC-23)', () => {
  const tree = buildPermissionTree(CATALOG);
  const documentGroup = groupOf(tree, 'document');

  it('selects every descendant of an unchecked group, keeping the existing order first', () => {
    expect(toggleNode(documentGroup, ['role:read'])).toEqual([
      'role:read',
      'document:read',
      'document:read:article',
      'document:update:article',
      'document:read:page',
    ]);
  });

  it('selects the rest of an indeterminate group without duplicates', () => {
    expect(toggleNode(documentGroup, ['document:read:page', 'role:read'])).toEqual([
      'document:read:page',
      'role:read',
      'document:read',
      'document:read:article',
      'document:update:article',
    ]);
  });

  it('clears every descendant of a checked group and keeps the other slugs', () => {
    const all = ['role:read', ...nodeSlugs(documentGroup)];
    expect(toggleNode(documentGroup, all)).toEqual(['role:read']);
  });

  it('toggles a sub-group only within its own slugs', () => {
    const article = groupOf(documentGroup.children, 'document:article');
    expect(toggleNode(article, ['document:read'])).toEqual([
      'document:read',
      'document:read:article',
      'document:update:article',
    ]);
  });

  it('adds a slug that is not selected and removes one that is', () => {
    expect(toggleSlug(['a:b'], 'c:d')).toEqual(['a:b', 'c:d']);
    expect(toggleSlug(['a:b', 'c:d'], 'a:b')).toEqual(['c:d']);
  });
});

describe('filterPermissionTree (AC-23)', () => {
  const tree = buildPermissionTree(CATALOG, ['ghost:read']);

  it('returns the same tree for a blank query', () => {
    expect(filterPermissionTree(tree, '  ')).toBe(tree);
  });

  it('keeps matching leaves (slug, name or description, any case) and drops empty groups', () => {
    expect(shape(filterPermissionTree(tree, 'ARTICLE'))).toEqual([
      ['document', 'document', []],
      ['document:article', 'article', ['document:read:article', 'document:update:article']],
    ]);
    expect(shape(filterPermissionTree(tree, 'list roles'))).toEqual([
      ['role', 'role', ['role:read']],
    ]);
    expect(shape(filterPermissionTree(tree, 'ghost'))).toEqual([
      [UNKNOWN_GROUP_ID, 'Unknown permissions', ['ghost:read']],
    ]);
  });

  it('returns no groups when nothing matches', () => {
    expect(filterPermissionTree(tree, 'zzz')).toEqual([]);
  });
});

describe('groupSlugsByResource (AC-18)', () => {
  it('groups slugs by resource, both sorted', () => {
    expect(groupSlugsByResource(['role:read', 'document:read:article', 'document:read'])).toEqual([
      { resource: 'document', slugs: ['document:read', 'document:read:article'] },
      { resource: 'role', slugs: ['role:read'] },
    ]);
  });
});

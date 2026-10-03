import { describe, expect, it } from 'vitest';

import { groupByResource, sortBySlug } from './permissionGroups';

const p = (slug: string) => ({ slug });

describe('sortBySlug (Phase 6 AC-22)', () => {
  it('sorts by slug without changing the input', () => {
    const input = [p('user:read'), p('document:read'), p('document:create')];
    expect(sortBySlug(input).map((x) => x.slug)).toEqual([
      'document:create',
      'document:read',
      'user:read',
    ]);
    expect(input[0]?.slug).toBe('user:read');
  });
});

describe('groupByResource (AC-24, Phase 6 AC-22)', () => {
  const all = sortBySlug([
    p('document:create'),
    p('document:read'),
    p('document:update'),
    p('role:read'),
    p('user:read'),
    p('nocolon'),
  ]);

  it('groups the rows by the resource before the first colon, in row order', () => {
    const groups = groupByResource(all, all);
    expect(groups.map((g) => [g.resource, g.permissions.map((x) => x.slug), g.total])).toEqual([
      ['document', ['document:create', 'document:read', 'document:update'], 3],
      ['nocolon', ['nocolon'], 1],
      ['role', ['role:read'], 1],
      ['user', ['user:read'], 1],
    ]);
  });

  it('keeps the full count of a group split across pages', () => {
    const second = all.slice(2, 4);
    const groups = groupByResource(second, all);
    expect(groups).toEqual([
      { resource: 'document', permissions: [p('document:update')], total: 3 },
      { resource: 'nocolon', permissions: [p('nocolon')], total: 1 },
    ]);
  });

  it('returns no groups for an empty page', () => {
    expect(groupByResource([], all)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { makeRole, makeUser } from '@/test/fixtures';

import { assignableRoles, roleLevelOf, usersWithRoles } from './roleHierarchy';

const SUPER = makeRole({ documentId: 'role-super', name: 'Super Admin', level: 100 });
const ADMIN = makeRole({ documentId: 'role-admin', name: 'Admin', level: 50 });
const EDITOR = makeRole({ documentId: 'role-editor', name: 'Editor', level: 20 });
const GUEST = makeRole({ documentId: 'role-guest', name: 'Guest', level: 0 });
const ROLES = [EDITOR, SUPER, GUEST, ADMIN];

describe('roleLevelOf (AC-14, Assumption 4)', () => {
  it.each([
    ['a null role is level 0', null, ROLES, 0],
    ['a null role is level 0 even without the roles list', null, undefined, 0],
    ['a known role is its level', 'role-admin', ROLES, 50],
    ['an unmatched id is unknown', 'role-gone', ROLES, undefined],
    ['any role is unknown without the roles list', 'role-admin', undefined, undefined],
  ] as const)('%s', (_, roleId, roles, expected) => {
    expect(roleLevelOf(roleId, roles)).toBe(expected);
  });
});

describe('assignableRoles (AC-15)', () => {
  it('keeps roles strictly below the actor level, highest first', () => {
    expect(assignableRoles(ROLES, 50).map((role) => role.name)).toEqual(['Editor', 'Guest']);
  });

  it('returns every role, highest first, for an actor above them all', () => {
    expect(assignableRoles(ROLES, 101).map((role) => role.level)).toEqual([100, 50, 20, 0]);
  });

  it('returns nothing for a level-0 actor', () => {
    expect(assignableRoles(ROLES, 0)).toEqual([]);
  });

  it('does not change the input', () => {
    const roles = [...ROLES];
    assignableRoles(roles, 100);
    expect(roles).toEqual(ROLES);
  });
});

describe('usersWithRoles (AC-13, AC-14)', () => {
  const jane = makeUser({ documentId: 'u-jane', name: 'Jane Doe', roleId: 'role-admin' });
  const ann = makeUser({ documentId: 'u-ann', name: 'ann Lee', roleId: null });
  const bob = makeUser({ documentId: 'u-bob', name: 'Bob Stone', roleId: 'role-gone' });

  it('joins each user to its role and sorts by name, ignoring case', () => {
    const rows = usersWithRoles([jane, bob, ann], ROLES);

    expect(rows.map((row) => [row.user.name, row.roleName, row.level])).toEqual([
      ['ann Lee', 'No role', 0],
      ['Bob Stone', 'Unknown', undefined],
      ['Jane Doe', 'Admin', 50],
    ]);
    expect(rows[2]?.role).toBe(ADMIN);
    expect(rows[0]?.role).toBeNull();
  });

  it('shows "Unknown" and an unknown level for every assigned role without the roles list', () => {
    const rows = usersWithRoles([jane, ann], undefined);

    expect(rows.map((row) => [row.user.name, row.roleName, row.level])).toEqual([
      ['ann Lee', 'No role', 0],
      ['Jane Doe', 'Unknown', undefined],
    ]);
  });
});

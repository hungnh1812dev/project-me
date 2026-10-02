import type { Role } from '@/features/auth/types';

import type { User } from './types';

/** One Users-page row: the user, its joined role and the level the policies compare against. */
export interface UserRow {
  user: User;
  /** The joined role, or `null` when there is none or it is unknown. */
  role: Role | null;
  /** "No role", "Unknown" or the role's name (AC-13). */
  roleName: string;
  /** The target level: 0 for no role, `undefined` when unknown (Assumption 4). */
  level: number | undefined;
}

/**
 * The level of the role `roleId`: 0 for a `null` role, `undefined` when `roles` is unavailable or
 * holds no such role (Assumption 4).
 */
export function roleLevelOf(
  roleId: string | null,
  roles: readonly Role[] | undefined,
): number | undefined {
  if (roleId === null) return 0;
  return roles?.find((role) => role.documentId === roleId)?.level;
}

/** The roles an actor at `actorLevel` may assign: `level < actorLevel`, highest first (AC-15). */
export function assignableRoles(roles: readonly Role[], actorLevel: number): Role[] {
  return roles.filter((role) => role.level < actorLevel).sort((a, b) => b.level - a.level);
}

/** Joins each user to its role (AC-13) and sorts the rows by name, ignoring case. */
export function usersWithRoles(
  users: readonly User[],
  roles: readonly Role[] | undefined,
): UserRow[] {
  return users
    .map((user): UserRow => {
      if (user.roleId === null) return { user, role: null, roleName: 'No role', level: 0 };
      const role = roles?.find((candidate) => candidate.documentId === user.roleId) ?? null;
      return role
        ? { user, role, roleName: role.name, level: role.level }
        : { user, role: null, roleName: 'Unknown', level: undefined };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name, undefined, { sensitivity: 'base' }));
}

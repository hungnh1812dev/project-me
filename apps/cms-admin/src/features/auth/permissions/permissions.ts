import type { Role } from '../types';

const MANAGER = 'manager';

/** Named level floors only. Roles are dynamic, so never hardcode a role list. */
export const ROLE_LEVEL = Object.freeze({ ADMIN: 50, SUPER_ADMIN: 100 } as const);

/**
 * Mirrors the backend permission model (`PermissionsGuard`):
 * - an exact match passes;
 * - `<res>:manager` satisfies `<res>:read`;
 * - global `document:<action>` satisfies scoped `document:<action>:<slug>`, never the reverse.
 * Malformed slugs (not `resource:action[:scope]`, or with an empty part) are never granted.
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  const parts = required.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => p === '')) return false;
  if (granted.includes(required)) return true;

  const [resource, action, scope] = parts;
  if (action === 'read' && granted.includes(`${resource}:${MANAGER}`)) return true;
  if (resource === 'document' && scope !== undefined) return granted.includes(`document:${action}`);
  return false;
}

/** Every slug is granted. An empty requirement passes. */
export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((slug) => hasPermission(granted, slug));
}

/** At least one slug is granted. An empty requirement fails. */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((slug) => hasPermission(granted, slug));
}

/** The role's slug is one of `slugs`. A null role has no slug. */
export function hasRole(role: Role | null, slugs: string | readonly string[]): boolean {
  if (!role) return false;
  return typeof slugs === 'string' ? role.slug === slugs : slugs.includes(role.slug);
}

/** The role's level is at least `level`. A null role is level 0. */
export function hasMinLevel(role: Role | null, level: number): boolean {
  return (role?.level ?? 0) >= level;
}

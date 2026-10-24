import {
  OWNER_ROLE_SLUG,
  type PermissionAction,
} from '../../config/access.constants';
import { useCurrentUser } from '../auth';
import type { Role } from './access.api';
import { useRolesQuery } from './access-queries';

/**
 * What the signed-in account may do on system subjects, for hiding actions
 * (T18 Q3). Derived from its own role's rows in `GET /roles`; the owner may
 * do everything. Only a UI hint: cms-api enforces every rule itself.
 */
export interface CallerAccess {
  /** False until the roles answer is in (nothing is shown meanwhile). */
  ready: boolean;
  isOwner: boolean;
  can: (subject: string, action: PermissionAction) => boolean;
}

const NOTHING: CallerAccess['can'] = () => false;
const EVERYTHING: CallerAccess['can'] = () => true;

/**
 * Pure part: `roles` undefined = unknown (still loading, failed, or the
 * caller lacks `roles:read`), which allows nothing for non-owners.
 */
export function callerAccessOf(
  roleSlug: string | undefined,
  roles: readonly Role[] | undefined,
): Omit<CallerAccess, 'ready'> {
  if (roleSlug === OWNER_ROLE_SLUG) return { isOwner: true, can: EVERYTHING };
  const own = roles?.find((role) => role.slug === roleSlug);
  if (own === undefined) return { isOwner: false, can: NOTHING };
  const held = new Set(
    own.permissions.map((row) => `${row.subject}:${row.action}`),
  );
  return {
    isOwner: false,
    can: (subject, action) => held.has(`${subject}:${action}`),
  };
}

export function useCallerAccess(): CallerAccess {
  const user = useCurrentUser();
  const roles = useRolesQuery();
  const isOwner = user?.role === OWNER_ROLE_SLUG;
  return {
    ready: isOwner || !roles.isPending,
    ...callerAccessOf(user?.role, roles.data),
  };
}

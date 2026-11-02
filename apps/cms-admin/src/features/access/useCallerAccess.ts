import { useCurrentUser } from '../auth';
import type { Role } from './Access.api';
import {
  CONTENT_WILDCARD_SUBJECT,
  OWNER_ROLE_SLUG,
  type PermissionAction,
} from './Access.constants';
import { useRolesQuery } from './Access.queries';

/**
 * What the signed-in account may do on system subjects, for hiding actions.
 * Derived from its own role's rows in `GET /roles`; the owner may
 * do everything. Only a UI hint: cms-api enforces every rule itself.
 */
export interface CallerAccess {
  /** False until the roles answer is in (nothing is shown meanwhile). */
  isReady: boolean;
  isOwner: boolean;
  can: (subject: string, action: PermissionAction) => boolean;
  /**
   * True when the caller holds `update` on the content type (or the content
   * wildcard) with write access to every named root field. Discard needs it.
   * Only a UI hint: cms-api decides.
   */
  canWriteEveryField: (subject: string, fieldNames: readonly string[]) => boolean;
}

const NOTHING: CallerAccess['can'] = () => false;
const EVERYTHING: CallerAccess['can'] = () => true;
const NO_FIELDS: CallerAccess['canWriteEveryField'] = () => false;
const EVERY_FIELD: CallerAccess['canWriteEveryField'] = () => true;

/**
 * Pure part: `roles` undefined = unknown (still loading, failed, or the
 * caller lacks `roles:read`), which allows nothing for non-owners.
 */
export function callerAccessOf(
  roleSlug: string | undefined,
  roles: readonly Role[] | undefined,
): Omit<CallerAccess, 'isReady'> {
  if (roleSlug === OWNER_ROLE_SLUG)
    return { isOwner: true, can: EVERYTHING, canWriteEveryField: EVERY_FIELD };
  const own = roles?.find((role) => role.slug === roleSlug);
  if (own === undefined) return { isOwner: false, can: NOTHING, canWriteEveryField: NO_FIELDS };
  const held = new Set(own.permissions.map((row) => `${row.subject}:${row.action}`));
  return {
    isOwner: false,
    can: (subject, action) => held.has(`${subject}:${action}`),
    canWriteEveryField: (subject, fieldNames) => {
      const updateRows = own.permissions.filter(
        (row) =>
          row.action === 'update' &&
          (row.subject === subject || row.subject === CONTENT_WILDCARD_SUBJECT),
      );
      if (updateRows.some((row) => row.writableFields === null)) return true;
      const writable = new Set(updateRows.flatMap((row) => row.writableFields ?? []));
      return updateRows.length > 0 && fieldNames.every((name) => writable.has(name));
    },
  };
}

export function useCallerAccess(): CallerAccess {
  const user = useCurrentUser();
  const roles = useRolesQuery();
  const isOwner = user?.role === OWNER_ROLE_SLUG;
  return {
    isReady: isOwner || !roles.isPending,
    ...callerAccessOf(user?.role, roles.data),
  };
}

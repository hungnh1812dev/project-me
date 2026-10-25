import { PermissionAction, type SystemSubject } from '../../access';

/**
 * Callers allowed this permission see every content type and every field,
 * whatever they can read themselves: building a role's permission matrix
 * needs the whole catalog (decided for the permission matrix). The rank rule still bounds the
 * roles they can edit.
 */
export const FULL_CATALOG_PERMISSION = {
  action: PermissionAction.update,
  subject: 'roles',
} as const satisfies { action: PermissionAction; subject: SystemSubject };

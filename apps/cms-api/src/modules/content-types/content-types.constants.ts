import { PermissionAction } from '../../generated/prisma/client';
import type { SystemSubject } from '../access/access.constants';

/** Error codes of the content types API (T17b). */
export const CONTENT_TYPES_ERROR_CODES = {
  /**
   * The slug is not registered, or the caller may not read it. Both answer
   * the same 404 so the API does not reveal which types exist.
   */
  NOT_FOUND: 'CONTENT_TYPE_NOT_FOUND',
} as const;

export const CONTENT_TYPES_ERROR_MESSAGES = {
  NOT_FOUND: 'Content type not found.',
} as const;

/**
 * Callers allowed this permission see every content type and every field,
 * whatever they can read themselves: building a role's permission matrix
 * needs the whole catalog (decision T17b). The rank rule still bounds the
 * roles they can edit.
 */
export const FULL_CATALOG_PERMISSION = {
  action: PermissionAction.update,
  subject: 'roles',
} as const satisfies { action: PermissionAction; subject: SystemSubject };

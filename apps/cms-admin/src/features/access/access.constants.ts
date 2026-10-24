/**
 * Access-control vocabulary of cms-api, mirrored for the admin UI.
 * Keep in sync with apps/cms-api/src/modules/access/access.constants.ts and
 * access-management.constants.ts; the server validates everything anyway.
 */

import type { PermissionAction } from '../../lib/permission-action';

export {
  PERMISSION_ACTIONS,
  type PermissionAction,
} from '../../lib/permission-action';

/** Row subject covering every content type (never a system subject). */
export const CONTENT_WILDCARD_SUBJECT = '*';

/** Actions whose rows carry `readableFields`. */
export const READABLE_FIELD_ACTIONS: readonly PermissionAction[] = ['read'];

/** Actions whose rows carry `writableFields`. */
export const WRITABLE_FIELD_ACTIONS: readonly PermissionAction[] = [
  'create',
  'update',
];

/** Non-content subjects and the actions valid on each (matrix order). */
export const SYSTEM_SUBJECT_ACTIONS = {
  accounts: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'create', 'update', 'delete'],
  api_tokens: ['read', 'create', 'update', 'delete'],
  media: ['read', 'create', 'update', 'delete'],
  audit_logs: ['read'],
  reviewer_settings: ['read', 'update'],
} as const satisfies Record<string, readonly PermissionAction[]>;

export type SystemSubject = keyof typeof SYSTEM_SUBJECT_ACTIONS;

export const SYSTEM_SUBJECTS = Object.keys(
  SYSTEM_SUBJECT_ACTIONS,
) as SystemSubject[];

/** The owner holds every permission without rows (SPEC §1). */
export const OWNER_ROLE_SLUG = 'owner';

/** System roles that are never given to an invited account. */
export const UNASSIGNABLE_ROLE_SLUGS: readonly string[] = [
  'public',
  'reviewer',
];

export const ACCOUNT_STATUSES = ['invited', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Indentation step of nested fields in the field picker, in rem. */
export const FIELD_PICKER_INDENT_REM = 1.25;

/** Accounts per page of the accounts list (API default 20, max 100). */
export const ACCOUNTS_PAGE_SIZE = 20;

/** Spaces used when pretty-printing row conditions in the editor. */
export const CONDITIONS_JSON_INDENT = 2;

/** API tokens per page of the token list (API default 20, max 100). */
export const API_TOKENS_PAGE_SIZE = 20;

export const API_TOKEN_STATUSES = ['active', 'revoked', 'expired'] as const;
export type ApiTokenStatus = (typeof API_TOKEN_STATUSES)[number];

/** Hours, minutes and seconds that end a calendar day (token expiry date). */
export const END_OF_DAY_TIME = '23:59:59';

/**
 * Access-control vocabulary of cms-api (T14/T17), mirrored for the admin UI.
 * Keep in sync with apps/cms-api/src/modules/access/access.constants.ts and
 * access-management.constants.ts; the server validates everything anyway.
 */

/** Every permission action, in the server's enum order (matrix columns). */
export const PERMISSION_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

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

/** System roles that are never given to an invited account (T17). */
export const UNASSIGNABLE_ROLE_SLUGS: readonly string[] = [
  'public',
  'reviewer',
];

export const ACCOUNT_STATUSES = ['invited', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Input bounds of the accounts API (cms-api MANAGEMENT_LIMITS / auth constants). */
export const ACCOUNT_LIMITS = {
  DISPLAY_NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 254,
} as const;

/** Indentation step of nested fields in the field picker, in rem. */
export const FIELD_PICKER_INDENT_REM = 1.25;

/** Accounts per page of the accounts list (API default 20, max 100). */
export const ACCOUNTS_PAGE_SIZE = 20;

/** Skeleton rows shown while a table loads. */
export const TABLE_SKELETON_ROWS = 3;

/** Spaces used when pretty-printing row conditions in the editor. */
export const CONDITIONS_JSON_INDENT = 2;

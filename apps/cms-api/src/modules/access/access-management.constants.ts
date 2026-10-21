import type { SystemRoleSlug } from '../identity/identity.constants';

/** Error codes of the accounts and roles API (T17). */
export const MANAGEMENT_ERROR_CODES = {
  /** Body or params fail the request schema; `details.issues` lists paths. */
  INVALID_REQUEST: 'ACCESS_INVALID_REQUEST',
  /** D6 / §12-7: the target's rank is not below the actor's, or it is the actor. */
  RANK_FORBIDDEN: 'ACCESS_RANK_FORBIDDEN',
  /** A permission set grants a system subject action the actor lacks. */
  PERMISSION_NOT_HELD: 'PERMISSION_NOT_HELD',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_EMAIL_TAKEN: 'ACCOUNT_EMAIL_TAKEN',
  ACCOUNT_ALREADY_DISABLED: 'ACCOUNT_ALREADY_DISABLED',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_SLUG_TAKEN: 'ROLE_SLUG_TAKEN',
  /** Delete of a role some account (any status, deleted included) holds. */
  ROLE_IN_USE: 'ROLE_IN_USE',
  /** Delete of a system role, or a rank change on one (SPEC §6, D6). */
  ROLE_SYSTEM_IMMUTABLE: 'ROLE_SYSTEM_IMMUTABLE',
  /** The role is not meant for invited accounts (see UNASSIGNABLE_ROLE_SLUGS). */
  ROLE_NOT_ASSIGNABLE: 'ROLE_NOT_ASSIGNABLE',
} as const;

export const MANAGEMENT_ERROR_MESSAGES = {
  INVALID_REQUEST: 'The request is invalid.',
  RANK_FORBIDDEN:
    'You can only manage accounts and roles ranked below your own role.',
  PERMISSION_NOT_HELD: 'You cannot grant a permission you do not hold.',
  ACCOUNT_NOT_FOUND: 'Account not found.',
  ACCOUNT_EMAIL_TAKEN: 'An account with this email already exists.',
  ACCOUNT_ALREADY_DISABLED: 'The account is already disabled.',
  ROLE_NOT_FOUND: 'Role not found.',
  ROLE_SLUG_TAKEN: 'A role with this slug already exists.',
  ROLE_IN_USE: 'The role is still assigned to accounts.',
  ROLE_SYSTEM_IMMUTABLE: 'System roles cannot be deleted or re-ranked.',
  ROLE_NOT_ASSIGNABLE: 'This role cannot be assigned to an account.',
} as const;

/**
 * System roles never given to an invited account: `public` is the anonymous
 * visitor and `reviewer` belongs to ephemeral reviewer sessions (D2, T31).
 * `owner` is out of reach anyway (no rank is above it, D6).
 */
export const UNASSIGNABLE_ROLE_SLUGS: readonly SystemRoleSlug[] = [
  'public',
  'reviewer',
];

/** Input bounds of the accounts and roles API. */
export const MANAGEMENT_LIMITS = {
  DISPLAY_NAME_MAX_LENGTH: 100,
  ROLE_NAME_MAX_LENGTH: 100,
  ROLE_SLUG_MAX_LENGTH: 64,
  /** Rows in one `PUT /roles/:id/permissions` body. */
  MAX_PERMISSIONS_PER_ROLE: 500,
} as const;

/** Fields `account.updated` / `role.updated` may name in `metadata.fields`. */
export const ACCOUNT_UPDATABLE_FIELDS = ['displayName'] as const;
export const ROLE_UPDATABLE_FIELDS = ['name', 'rank'] as const;

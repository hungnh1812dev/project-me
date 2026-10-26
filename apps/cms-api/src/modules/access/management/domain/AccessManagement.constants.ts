/** Error codes of the accounts and roles API. */
export const MANAGEMENT_ERROR_CODES = {
  /** A permission set grants a system subject action the actor lacks. */
  PERMISSION_NOT_HELD: 'PERMISSION_NOT_HELD',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_EMAIL_TAKEN: 'ACCOUNT_EMAIL_TAKEN',
  ACCOUNT_ALREADY_DISABLED: 'ACCOUNT_ALREADY_DISABLED',
  /** Enable of an account that is not disabled. */
  ACCOUNT_NOT_DISABLED: 'ACCOUNT_NOT_DISABLED',
  /** Resend of an invite to an account that is not `invited`. */
  ACCOUNT_NOT_INVITED: 'ACCOUNT_NOT_INVITED',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_SLUG_TAKEN: 'ROLE_SLUG_TAKEN',
  /** Delete of a role some account (any status, deleted included) holds. */
  ROLE_IN_USE: 'ROLE_IN_USE',
  /** Delete of a system role, or a rank change on one (SPEC §6, D6). */
  ROLE_SYSTEM_IMMUTABLE: 'ROLE_SYSTEM_IMMUTABLE',
  /** The role is not meant for invited accounts (see UNASSIGNABLE_ROLE_SLUGS). */
  ROLE_NOT_ASSIGNABLE: 'ROLE_NOT_ASSIGNABLE',
  /** Create of a custom role past MANAGEMENT_LIMITS.MAX_CUSTOM_ROLES. */
  ROLE_LIMIT_REACHED: 'ROLE_LIMIT_REACHED',
  TOKEN_NOT_FOUND: 'API_TOKEN_NOT_FOUND',
  /** Update or revoke of a revoked token. */
  TOKEN_REVOKED: 'API_TOKEN_REVOKED',
  /** Update of an expired token; an expired token can still be revoked. */
  TOKEN_EXPIRED: 'API_TOKEN_EXPIRED',
  /** A token scope entry the token's creator does not hold (D5). */
  TOKEN_SCOPE_NOT_HELD: 'API_TOKEN_SCOPE_NOT_HELD',
} as const;

export const MANAGEMENT_ERROR_MESSAGES = {
  PERMISSION_NOT_HELD: 'You cannot grant a permission you do not hold.',
  ACCOUNT_NOT_FOUND: 'Account not found.',
  ACCOUNT_EMAIL_TAKEN: 'An account with this email already exists.',
  ACCOUNT_ALREADY_DISABLED: 'The account is already disabled.',
  ACCOUNT_NOT_DISABLED: 'The account is not disabled.',
  ACCOUNT_NOT_INVITED: 'The account has no pending invitation.',
  ROLE_NOT_FOUND: 'Role not found.',
  ROLE_SLUG_TAKEN: 'A role with this slug already exists.',
  ROLE_IN_USE: 'The role is still assigned to accounts.',
  ROLE_SYSTEM_IMMUTABLE: 'System roles cannot be deleted or re-ranked.',
  ROLE_NOT_ASSIGNABLE: 'This role cannot be assigned to an account.',
  ROLE_LIMIT_REACHED: 'The maximum number of custom roles is reached.',
  TOKEN_NOT_FOUND: 'API token not found.',
  TOKEN_REVOKED: 'The API token is revoked.',
  TOKEN_EXPIRED: 'The API token is expired.',
  TOKEN_SCOPE_NOT_HELD:
    'A token cannot be granted a permission its creator does not hold.',
} as const;

/** The issue text of an API token expiry that is not in the future. */
export const EXPIRY_NOT_IN_FUTURE_ISSUE = 'must be in the future';

/** Input bounds of the accounts and roles API. */
export const MANAGEMENT_LIMITS = {
  DISPLAY_NAME_MAX_LENGTH: 100,
  ROLE_NAME_MAX_LENGTH: 100,
  ROLE_SLUG_MAX_LENGTH: 64,
  /** Rows in one `PUT /roles/:id/permissions` body. */
  MAX_PERMISSIONS_PER_ROLE: 500,
  /** Custom roles (`is_system = false`); system roles do not count. */
  MAX_CUSTOM_ROLES: 50,
} as const;

/** Fields `account.updated` / `role.updated` may name in `metadata.fields`. */
export const ACCOUNT_UPDATABLE_FIELDS = ['displayName'] as const;
export const ROLE_UPDATABLE_FIELDS = ['name', 'rank'] as const;

/** API token states (SPEC D5), derived from the stored row; never stored. */
export const API_TOKEN_STATUSES = {
  ACTIVE: 'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
} as const;

export type ApiTokenStatus =
  (typeof API_TOKEN_STATUSES)[keyof typeof API_TOKEN_STATUSES];

/** Fields `api_token.updated` may name in `metadata.fields`. */
export const API_TOKEN_UPDATABLE_FIELDS = [
  'name',
  'scope',
  'expiresAt',
] as const;

/** Subjects the management audit rows name. */
export const MANAGEMENT_AUDIT_SUBJECTS = {
  ACCOUNTS: 'accounts',
  ROLES: 'roles',
  API_TOKENS: 'api_tokens',
} as const;

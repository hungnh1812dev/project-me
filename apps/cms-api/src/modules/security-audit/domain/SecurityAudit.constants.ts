/**
 * D15 security audit. Action names are `<domain>.<event>` in lower
 * snake case. Rows never hold field values or secrets: metadata carries
 * names only (field names, role slugs, a method, a purpose, a reason).
 */
export const AUDIT_ACTIONS = {
  AUTH_LOGIN_SUCCEEDED: 'auth.login_succeeded',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  AUTH_OTP_ISSUED: 'auth.otp_issued',
  PASSWORD_RESET: 'password.reset',
  /** Invite accepted: the invited account set its first password. */
  PASSWORD_SET: 'password.set',
  PASSWORD_CHANGED: 'password.changed',
  PASSWORD_CHANGE_FAILED: 'password.change_failed',
  TWO_FACTOR_ENABLED: 'two_factor.enabled',
  TWO_FACTOR_DISABLED: 'two_factor.disabled',
  /** Wrong code at the second login step. */
  TWO_FACTOR_VERIFY_FAILED: 'two_factor.verify_failed',
  /** Wrong password or code while turning 2FA on or off. */
  TWO_FACTOR_MANAGE_FAILED: 'two_factor.manage_failed',
  /** `owner:reset-2fa` (actor_type system). */
  TWO_FACTOR_RESET_BY_OPERATOR: 'two_factor.reset_by_operator',
  /** The single owner was created (`channel`: setup_page or cli; ADR 0005). */
  OWNER_CREATED: 'owner.created',
  /** Anonymous setup attempt refused (`reason`: bad_token or closed). */
  OWNER_SETUP_REJECTED: 'owner.setup_rejected',
  /** Test account created by the smoke-only `seed:account` CLI (actor_type system; D1, D15). */
  ACCOUNT_SEEDED: 'account.seeded',
  ACCOUNT_INVITED: 'account.invited',
  ACCOUNT_UPDATED: 'account.updated',
  ACCOUNT_ROLE_CHANGED: 'account.role_changed',
  ACCOUNT_DISABLED: 'account.disabled',
  ACCOUNT_ENABLED: 'account.enabled',
  ACCOUNT_INVITE_RESENT: 'account.invite_resent',
  ACCOUNT_SESSIONS_REVOKED: 'account.sessions_revoked',
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  ROLE_PERMISSIONS_REPLACED: 'role.permissions_replaced',
  API_TOKEN_CREATED: 'api_token.created',
  API_TOKEN_UPDATED: 'api_token.updated',
  API_TOKEN_REVOKED: 'api_token.revoked',
  MEDIA_DELETED: 'media.deleted',
  /** Owner turned reviewer access on or off (D15). */
  REVIEWER_SETTINGS_CHANGED: 'reviewer.settings_changed',
  /** A visitor started a reviewer session; actor = the new reviewer account. */
  REVIEWER_SESSION_CREATED: 'reviewer.session_created',
  /** Wrong password or code at a re-authentication (`purpose`, `reason`; ADR 0013). */
  AUTH_REAUTH_FAILED: 'auth.reauth_failed',
  /** The owner got a backup download link (`targetId` = file name; the URL is never stored). */
  BACKUP_DOWNLOAD_LINK_CREATED: 'backup.download_link_created',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** `auth.login_failed` metadata `reason`: a fixed set, nothing else. */
export const LOGIN_FAILURE_REASONS = {
  /** No account with this email: actor_id null, email only as a keyed HMAC. */
  UNKNOWN_ACCOUNT: 'unknown_account',
  /** Invited account that has not set a password yet. */
  NO_PASSWORD: 'no_password',
  BAD_PASSWORD: 'bad_password',
  /** Right password, but the account is disabled, invited or deleted. */
  NOT_ACTIVE: 'not_active',
} as const;

export type LoginFailureReason =
  (typeof LOGIN_FAILURE_REASONS)[keyof typeof LOGIN_FAILURE_REASONS];

/** `owner.created` metadata `channel`. */
export const OWNER_CREATED_CHANNELS = {
  SETUP_PAGE: 'setup_page',
  CLI: 'cli',
} as const;

export type OwnerCreatedChannel =
  (typeof OWNER_CREATED_CHANNELS)[keyof typeof OWNER_CREATED_CHANNELS];

/** `account.seeded` metadata `channel`. */
export const ACCOUNT_SEEDED_CHANNEL = 'cli_seed';

/** `owner.setup_rejected` metadata `reason`: a fixed set, nothing else. */
export const SETUP_REJECTION_REASONS = {
  BAD_TOKEN: 'bad_token',
  CLOSED: 'closed',
} as const;

export type SetupRejectionReason =
  (typeof SETUP_REJECTION_REASONS)[keyof typeof SETUP_REJECTION_REASONS];

/** `reason` of a failed re-authentication (password change, 2FA on/off). */
export const REAUTH_FAILURE_REASONS = {
  BAD_PASSWORD: 'bad_password',
  BAD_CODE: 'bad_code',
} as const;

/** `purpose` of `auth.reauth_failed`: the sensitive action a re-authentication guards. */
export const REAUTH_PURPOSES = {
  BACKUP_DOWNLOAD: 'backup_download',
} as const;

/** `operation` of `two_factor.manage_failed`. */
export const TWO_FACTOR_OPERATIONS = {
  ENABLE: 'enable',
  DISABLE: 'disable',
} as const;

/**
 * Keyed HMAC of a normalized email for `auth.login_failed` with an unknown
 * account: repeated attempts on one address can be linked without
 * storing the address. The key is derived from OTP_PEPPER with HKDF under
 * its own `info`, so it never equals the OTP key (no new env key).
 */
export const AUDIT_EMAIL_HMAC = {
  HKDF_DIGEST: 'sha256',
  HKDF_INFO: 'abyss/audit-email/v1',
  KEY_BYTES: 32,
  HMAC_ALGORITHM: 'sha256',
} as const;

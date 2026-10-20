/**
 * System roles (SPEC §6). Slug and rank are immutable; the migration pins the
 * same pairs in a CHECK constraint and a trigger, so keep both in sync.
 */
export const SYSTEM_ROLES = [
  { slug: 'public', name: 'Public', rank: 0 },
  { slug: 'guest', name: 'Guest', rank: 10 },
  { slug: 'reviewer', name: 'Reviewer', rank: 20 },
  { slug: 'editor', name: 'Editor', rank: 30 },
  { slug: 'admin', name: 'Admin', rank: 40 },
  { slug: 'owner', name: 'Owner', rank: 100 },
] as const;

export type SystemRoleSlug = (typeof SYSTEM_ROLES)[number]['slug'];

export const OWNER_ROLE_SLUG = 'owner' satisfies SystemRoleSlug;

/** SPEC §6: rank range for custom roles. */
export const CUSTOM_ROLE_RANK = { min: 11, max: 39 } as const;

/** D8: minimum password length. */
export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound so hashing cost stays predictable (decision T08). */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Argon2id parameters (D8; SPEC names the algorithm only, decision T08):
 * 64 MiB, 3 passes, 4 lanes. Above the OWASP minimum (19 MiB, t=2, p=1).
 */
export const ARGON2_OPTIONS = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Key for `pg_advisory_xact_lock`: serialises concurrent owner:bootstrap runs. */
export const OWNER_BOOTSTRAP_LOCK_KEY = 7_163_201_907n;

/** Error codes of the owner bootstrap. */
export const OWNER_BOOTSTRAP_ERRORS = {
  OWNER_EXISTS: 'owner.exists',
  EMAIL_TAKEN: 'owner.email_taken',
  ROLE_MISSING: 'owner.role_missing',
  INVALID_INPUT: 'owner.invalid_input',
} as const;

/** CLI-only environment keys (documented in .env.example). */
export const OWNER_ENV_KEYS = {
  email: 'OWNER_EMAIL',
  displayName: 'OWNER_DISPLAY_NAME',
} as const;

/** `owner:bootstrap --password-stdin`: read the password from stdin (CI, containers). */
export const PASSWORD_STDIN_FLAG = '--password-stdin';

/** SPEC §6 / D8: one-time codes (T12). */
export const OTP = {
  DIGITS: 6,
  TTL_SECONDS: 300,
  /** Checks allowed per code; the next check fails even with the right code (§12-9). */
  MAX_ATTEMPTS: 5,
  /** Codes issued per account per window, across all purposes (§12-9). */
  MAX_ISSUED_PER_WINDOW: 5,
  ISSUE_WINDOW_MS: 60 * 60 * 1_000,
  HMAC_ALGORITHM: 'sha256',
} as const;

/** Admin console pages named in OTP emails (plain text, no links; T12). */
export const ADMIN_PAGE_PATHS = {
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
} as const;

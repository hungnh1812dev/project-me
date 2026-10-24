import { MS_PER_HOUR } from '../../common/constants/time.constants';
import { ADMIN_ROLE_SLUG, GUEST_ROLE_SLUG } from '../access';

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

/** Longest owner display name, for the setup route and the CLI alike. */
export const OWNER_DISPLAY_NAME_MAX_LENGTH = 100;

/** Longest setup token the route compares; anything longer counts as wrong. */
export const SETUP_TOKEN_MAX_LENGTH = 256;
/** The token is compared as digests of this algorithm (equal length, no early exit). */
export const SETUP_TOKEN_DIGEST_ALGORITHM = 'sha256';

/** Machine-readable `errorCode`s of the owner setup route (ADR 0005). */
export const OWNER_SETUP_ERROR_CODES = {
  TOKEN_INVALID: 'SETUP_TOKEN_INVALID',
  EMAIL_TAKEN: 'OWNER_EMAIL_TAKEN',
} as const;

/** Messages of the owner setup route (ADR 0005). Never include submitted values. */
export const OWNER_SETUP_MESSAGES = {
  TOKEN_INVALID: 'The setup token is not valid.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  UNAVAILABLE: 'Setup is not available yet.',
  /** Logged at boot and after setup while the token is still configured. */
  TOKEN_STILL_SET:
    'OWNER_SETUP_TOKEN is set but an owner exists; remove it from the secret.',
} as const;

/** Error codes of `owner:reset-2fa` (T13a). */
export const TWO_FACTOR_RESET_ERRORS = {
  INVALID_INPUT: 'reset_2fa.invalid_input',
  ACCOUNT_NOT_FOUND: 'reset_2fa.account_not_found',
  NOT_ENABLED: 'reset_2fa.not_enabled',
} as const;

/** `owner:reset-2fa` options (parsed with node:util parseArgs, so no dashes). */
export const RESET_2FA_OPTIONS = {
  /** `--email <address>`: the account to reset. */
  EMAIL: 'email',
  /** `--yes`: skip the prompt; required where there is no terminal. */
  YES: 'yes',
} as const;

/** Answers to the `owner:reset-2fa` prompt that mean yes (default is no). */
export const CONFIRM_ANSWERS = ['y', 'yes'] as const;

/** CLI-only environment keys (documented in .env.example). */
export const OWNER_ENV_KEYS = {
  email: 'OWNER_EMAIL',
  displayName: 'OWNER_DISPLAY_NAME',
} as const;

/** `owner:bootstrap --password-stdin`: read the password from stdin (CI, containers). */
export const PASSWORD_STDIN_FLAG = '--password-stdin';

/**
 * `seed:account` (smoke stacks only, SPEC D1). Roles it may create: an
 * explicit allowlist. `owner` and `reviewer` are never in it.
 */
export const SEED_ACCOUNT_ROLES: readonly string[] = [
  ADMIN_ROLE_SLUG,
  GUEST_ROLE_SLUG,
];

/** Per-invocation opt-in that `seed:account` demands when NODE_ENV=production (D17). */
export const SEED_ACCOUNT_OPT_IN = {
  ENV_KEY: 'ALLOW_ACCOUNT_SEED',
  VALUE: 'smoke',
} as const;

/** `seed:account` options (parsed with node:util parseArgs, so no dashes). */
export const SEED_ACCOUNT_OPTIONS = {
  EMAIL: 'email',
  ROLE: 'role',
  /** Turns on email 2FA for the seeded account. */
  EMAIL_2FA: 'email-2fa',
  PASSWORD_STDIN: 'password-stdin',
} as const;

/** Error codes of `seed:account`. */
export const SEED_ACCOUNT_ERRORS = {
  NOT_ALLOWED: 'seed_account.not_allowed',
  INVALID_INPUT: 'seed_account.invalid_input',
  ROLE_REFUSED: 'seed_account.role_refused',
  EMAIL_TAKEN: 'seed_account.email_taken',
} as const;

/** SPEC §6 / D8: one-time codes (T12). */
export const OTP = {
  DIGITS: 6,
  TTL_SECONDS: 300,
  /** Checks allowed per code; the next check fails even with the right code (§12-9). */
  MAX_ATTEMPTS: 5,
  /** Codes issued per account per window, across all purposes (§12-9). */
  MAX_ISSUED_PER_WINDOW: 5,
  ISSUE_WINDOW_MS: MS_PER_HOUR,
  HMAC_ALGORITHM: 'sha256',
} as const;

/** Admin console pages named in OTP emails (plain text, no links; T12). */
export const ADMIN_PAGE_PATHS = {
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
} as const;

/**
 * D8 / T13 Q3: TOTP as every authenticator app supports it (RFC 6238
 * defaults): SHA-1, 6 digits, 30 s steps, ±1 step of clock drift, 160-bit
 * secret. A code is accepted only when its step is above `totp_last_step`.
 */
export const TOTP = {
  ALGORITHM: 'sha1',
  DIGITS: 6,
  PERIOD_SECONDS: 30,
  TOLERANCE_STEPS: 1,
  SECRET_BYTES: 20,
} as const;

/**
 * D8 / T13 Q1: AES-256-GCM for stored TOTP secrets. The AES key is derived
 * from TOTP_ENC_KEY with HKDF-SHA256 under `HKDF_INFO`; ciphertext is
 * `v1.<iv>.<ct>.<tag>` (base64url) with AAD `<documentId>:<kid>`.
 */
export const SECRET_BOX = {
  VERSION: 'v1',
  SEPARATOR: '.',
  CIPHER: 'aes-256-gcm',
  HKDF_DIGEST: 'sha256',
  HKDF_INFO: 'abyss/totp-secret/v1',
  KEY_BYTES: 32,
  IV_BYTES: 12,
  TAG_BYTES: 16,
} as const;

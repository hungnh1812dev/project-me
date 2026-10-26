import {
  MS_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from '../../../common/constants/Time.constants';
import { ADMIN_ROLE_SLUG, GUEST_ROLE_SLUG } from '../../access';

/** What a one-time code may be used for. Values are stored in the database, so they stay byte-identical to the database enum. */
export const OtpPurpose = {
  INVITE_SET_PASSWORD: 'INVITE_SET_PASSWORD',
  RESET_PASSWORD: 'RESET_PASSWORD',
  LOGIN_2FA_EMAIL: 'LOGIN_2FA_EMAIL',
} as const;

export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

/** Second-factor method an account can use. Values are stored in the database, so they stay byte-identical to the database enum. */
export const TwoFaMethod = {
  totp: 'totp',
  email: 'email',
} as const;

export type TwoFaMethod = (typeof TwoFaMethod)[keyof typeof TwoFaMethod];

/** The OTP purpose of a mailed second-factor code (login, enable, disable). */
export const EMAIL_CODE_PURPOSE = OtpPurpose.LOGIN_2FA_EMAIL;

/** D8: minimum password length. */
export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound so hashing cost stays predictable. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Argon2id parameters (D8; SPEC names the algorithm only):
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

/** Error codes of `owner:reset-2fa`. */
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

/** SPEC §6 / D8: one-time codes. */
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

/** Admin console pages named in OTP emails (plain text, no links). */
export const ADMIN_PAGE_PATHS = {
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
} as const;

/**
 * D8: TOTP as every authenticator app supports it (RFC 6238
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
 * D8: AES-256-GCM for stored TOTP secrets. The AES key is derived
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

/** SPEC §6: access token lifetime (15 min). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * SECONDS_PER_MINUTE;

/** SPEC §6: a reviewer session lasts 24 h; its access token expires then too. */
export const REVIEWER_SESSION_TTL_SECONDS = 24 * SECONDS_PER_HOUR;

/** SPEC §6: refresh token lifetime (7 days), restarted on every rotation. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * SECONDS_PER_DAY;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * MS_PER_SECOND;

/**
 * An already-rotated refresh token that comes back this soon after its
 * rotation, while its successor is still unused, is a concurrent refresh
 * (two tabs, a retried request), not reuse. 10 s covers one slow round trip
 * plus tabs that wake from sleep together, and is tiny next to the 15 min
 * access token. Such a request gets an access token only (no new refresh
 * token), so a replay inside the window can't gain a lasting session.
 */
export const REFRESH_TOKEN_REUSE_GRACE_SECONDS = 10;
export const REFRESH_TOKEN_REUSE_GRACE_MS =
  REFRESH_TOKEN_REUSE_GRACE_SECONDS * MS_PER_SECOND;

/** SPEC §6: 2FA temp token lifetime (300 s). */
export const TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS = 300;
/** SPEC §6: code checks allowed per temp token; then the token is dead. */
export const TWO_FACTOR_TEMP_TOKEN_MAX_ATTEMPTS = 5;
/** Generous bound on a raw temp token (a JWT is ~300 characters). */
export const TWO_FACTOR_TEMP_TOKEN_MAX_LENGTH = 2_048;
/**
 * Most live temp tokens the in-memory challenge store tracks. Each
 * entry is ~150 bytes; at the cap expired entries are swept, then new
 * challenges are refused (429, fail closed) like the rate-limit store.
 */
export const TWO_FACTOR_CHALLENGE_MAX_KEYS = 10_000;

/** D9: the only accepted JWT algorithm. Every other alg, `none` included, is rejected. */
export const JWT_ALGORITHM = 'HS256';

/**
 * `typ` claim that separates access tokens from 2FA temp tokens, so a temp
 * token can never pass the access-token strategy.
 */
export const TOKEN_TYPES = {
  ACCESS: 'access',
  TWO_FACTOR: '2fa',
} as const;

/** Entropy of an opaque refresh token (256 bits). */
export const REFRESH_TOKEN_BYTES = 32;
/** Refresh tokens are stored only as this digest (hex) of the raw value. */
export const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';

/** RFC 5321 path limit; longer input can't be a stored email. */
export const EMAIL_MAX_LENGTH = 254;

/** Stored `refresh_tokens.user_agent` is cut to this many characters. */
export const USER_AGENT_MAX_LENGTH = 512;

/** Random bytes behind the dummy hash used for unknown emails (timing parity). */
export const DUMMY_PASSWORD_BYTES = 32;

/** `errorCode` values of the auth endpoints. */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'AUTH_INVALID_REFRESH_TOKEN',
  ORIGIN_NOT_ALLOWED: 'AUTH_ORIGIN_NOT_ALLOWED',
  INVALID_REQUEST: 'AUTH_INVALID_REQUEST',
  /** Wrong, expired, used or exhausted code, or unknown email: one answer (D8). */
  INVALID_OTP: 'AUTH_INVALID_OTP',
  WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  /** Password reset of an account with TOTP needs an authenticator code (D8). */
  TOTP_REQUIRED: 'AUTH_TOTP_REQUIRED',
  /** Wrong, replayed or expired 2FA code: one answer for all. */
  INVALID_2FA_CODE: 'AUTH_INVALID_2FA_CODE',
  /** 2FA temp token expired, used up, already used or forged. */
  INVALID_TEMP_TOKEN: 'AUTH_INVALID_TEMP_TOKEN',
  TWO_FACTOR_ALREADY_ENABLED: 'AUTH_2FA_ALREADY_ENABLED',
  TWO_FACTOR_NOT_ENABLED: 'AUTH_2FA_NOT_ENABLED',
  /** Enable with TOTP before `POST /auth/2fa/totp/setup`. */
  TWO_FACTOR_SETUP_REQUIRED: 'AUTH_2FA_SETUP_REQUIRED',
} as const;

/** Client-facing messages. Identical for every login failure (no enumeration). */
export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_REFRESH_TOKEN: 'Session expired, sign in again',
  ORIGIN_NOT_ALLOWED: 'Request origin is not allowed',
  INVALID_REQUEST: 'Email and password are required',
  JWT_NOT_CONFIGURED: 'JWT_ACCESS_SECRET is not configured',
  INVALID_PASSWORD_REQUEST: 'The request is missing required fields',
  INVALID_OTP: 'The code is invalid or has expired',
  WEAK_PASSWORD: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
  TOTP_REQUIRED: 'A valid authenticator code is required',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect',
  INVALID_TWO_FACTOR_REQUEST: 'The request is missing required fields',
  INVALID_2FA_CODE: 'The code is invalid or has expired',
  INVALID_TEMP_TOKEN: 'Sign-in expired, sign in again',
  TWO_FACTOR_ALREADY_ENABLED: 'Two-factor authentication is already on',
  TWO_FACTOR_NOT_ENABLED: 'Two-factor authentication is off',
  TWO_FACTOR_SETUP_REQUIRED: 'Set up the authenticator app first',
} as const;

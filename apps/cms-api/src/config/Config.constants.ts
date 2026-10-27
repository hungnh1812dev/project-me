/** DI token for the frozen `IAppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const MAIL_PROVIDERS = ['console', 'smtp'] as const;
export const MEDIA_PROVIDERS = ['fake', 'cloudinary'] as const;

/** D17: production secrets must be at least this many bytes. */
export const MIN_SECRET_BYTES = 32;

/** Env keys holding secrets. Required and length-checked in production. */
export const SECRET_ENV_KEYS = [
  'JWT_ACCESS_SECRET',
  'OTP_PEPPER',
  'TOTP_ENC_KEY',
] as const;

/** Secrets that may be unset, but are length-checked in production when set. */
export const OPTIONAL_SECRET_ENV_KEYS = [
  'OWNER_SETUP_TOKEN',
  'TOTP_ENC_PREVIOUS_KEY',
] as const;

export const CONFIG_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 3000,
  /** PostgreSQL default port, used when DB_PORT is unset. */
  DB_PORT: 5432,
  TRUST_PROXY_HOPS: 1,
  MAIL_PROVIDER: 'console',
  /** In-memory storage for development and tests; production needs cloudinary. */
  MEDIA_PROVIDER: 'fake',
  /** Key id used outside production when JWT_ACCESS_KID is unset. */
  JWT_ACCESS_KID: 'dev',
  /** Key id used outside production when TOTP_ENC_KID is unset. */
  TOTP_ENC_KID: 'dev',
  /** Issuer shown in authenticator apps. */
  TOTP_ISSUER: 'Abyss CMS',
  /** SMTP submission port (STARTTLS when the server offers it). */
  SMTP_PORT: 587,
  /** false = plain connect + STARTTLS upgrade; true = TLS from the start (465). */
  SMTP_SECURE: false,
  /** R2 accepts `auto`; other S3 providers need their own region. */
  BACKUP_STORAGE_REGION: 'auto',
  /** Key prefix of the nightly dumps in the bucket (ADR 0013 section 2). */
  BACKUP_STORAGE_PREFIX: 'postgres/',
} as const;

/**
 * The backup bucket is set up with all of these or none of them (ADR 0013
 * section 4). Region and prefix have defaults and are not part of the group.
 */
export const BACKUP_STORAGE_REQUIRED_KEYS = [
  'BACKUP_STORAGE_ENDPOINT',
  'BACKUP_STORAGE_BUCKET',
  'BACKUP_STORAGE_ACCESS_KEY_ID',
  'BACKUP_STORAGE_SECRET_ACCESS_KEY',
] as const;

/** Ends with a slash (so `postgres/` never matches `postgres-old/`) and does not start with one. */
export const BACKUP_STORAGE_PREFIX_PATTERN = /^[^/].*\/$/;

/** JWT `kid` values: short, header- and log-safe. */
export const JWT_KID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * TOTP issuer: the otpauth label is `issuer:email`, so no colon; short enough
 * to fit an authenticator app's row.
 */
export const TOTP_ISSUER_MAX_LENGTH = 64;
export const TOTP_ISSUER_PATTERN = new RegExp(
  `^[^:]{1,${TOTP_ISSUER_MAX_LENGTH}}$`,
);

export const MAX_PORT = 65_535;

/** The only accepted value of ALLOW_LOGIN_RATE_LIMIT_OVERRIDE (also gates REFRESH_RATE_LIMIT_IP). */
export const LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN = 'smoke';

/**
 * Env keys that may replace one rate-limit rule's limit. Config
 * names env keys only; a rule opts in with `limitOverrideEnvKey`. Refused in
 * production unless ALLOW_LOGIN_RATE_LIMIT_OVERRIDE opts in, so a stray value
 * can't weaken D7.
 */
export const RATE_LIMIT_OVERRIDE_ENV_KEYS = [
  'LOGIN_RATE_LIMIT_IP',
  'LOGIN_RATE_LIMIT_EMAIL',
  'REFRESH_RATE_LIMIT_IP',
] as const;

export type RateLimitOverrideEnvKey =
  (typeof RATE_LIMIT_OVERRIDE_ENV_KEYS)[number];

/** Upper bound of the optional login rate-limit overrides. */
export const MAX_RATE_LIMIT_OVERRIDE = 1_000_000;

/** `URL.protocol` values accepted for ADMIN_ORIGIN and WEB_ORIGIN. */
export const ALLOWED_ORIGIN_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Shown instead of secret values in the boot summary. */
export const REDACTED = '[redacted]';

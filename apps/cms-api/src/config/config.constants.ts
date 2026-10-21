/** DI token for the frozen `IAppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const MAIL_PROVIDERS = ['console', 'smtp'] as const;

/** D17: production secrets must be at least this many bytes. */
export const MIN_SECRET_BYTES = 32;

/** Env keys holding secrets. Required and length-checked in production. */
export const SECRET_ENV_KEYS = [
  'JWT_ACCESS_SECRET',
  'OTP_PEPPER',
  'TOTP_ENC_KEY',
] as const;

export const CONFIG_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 3000,
  TRUST_PROXY_HOPS: 1,
  MAIL_PROVIDER: 'console',
  /** Key id used outside production when JWT_ACCESS_KID is unset. */
  JWT_ACCESS_KID: 'dev',
  /** Key id used outside production when TOTP_ENC_KID is unset. */
  TOTP_ENC_KID: 'dev',
  /** Issuer shown in authenticator apps (T13, Q4). */
  TOTP_ISSUER: 'Abyss CMS',
  /** SMTP submission port (STARTTLS when the server offers it). */
  SMTP_PORT: 587,
  /** false = plain connect + STARTTLS upgrade; true = TLS from the start (465). */
  SMTP_SECURE: false,
} as const;

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

/** The only accepted value of ALLOW_LOGIN_RATE_LIMIT_OVERRIDE (T18b; also gates REFRESH_RATE_LIMIT_IP, T18c). */
export const LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN = 'smoke';

/** Upper bound of the optional login rate-limit overrides (T18b). */
export const MAX_RATE_LIMIT_OVERRIDE = 1_000_000;

/** `URL.protocol` values accepted for ADMIN_ORIGIN and WEB_ORIGIN. */
export const ALLOWED_ORIGIN_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Shown instead of secret values in the boot summary. */
export const REDACTED = '[redacted]';

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
} as const;

/** JWT `kid` values: short, header- and log-safe. */
export const JWT_KID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const MAX_PORT = 65_535;

/** `URL.protocol` values accepted for ADMIN_ORIGIN and WEB_ORIGIN. */
export const ALLOWED_ORIGIN_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Shown instead of secret values in the boot summary. */
export const REDACTED = '[redacted]';

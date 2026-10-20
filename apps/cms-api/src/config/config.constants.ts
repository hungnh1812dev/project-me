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
} as const;

export const MAX_PORT = 65_535;

/** Shown instead of secret values in the boot summary. */
export const REDACTED = '[redacted]';

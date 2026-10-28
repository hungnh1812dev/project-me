import { isAbsolute } from 'node:path';

import { z } from 'zod';

import {
  ALLOWED_ORIGIN_PROTOCOLS,
  BACKUP_STORAGE_PREFIX_PATTERN,
  CONFIG_DEFAULTS,
  DB_SSL_MODES,
  JWT_KID_PATTERN,
  LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN,
  MAIL_PROVIDERS,
  MEDIA_PROVIDERS,
  MAX_RATE_LIMIT_OVERRIDE,
  NODE_ENVS,
  RATE_LIMIT_OVERRIDE_ENV_KEYS,
  type RateLimitOverrideEnvKey,
  TOTP_ISSUER_MAX_LENGTH,
  TOTP_ISSUER_PATTERN,
} from './Config.constants';
import {
  emptyToUndefined,
  envBoolean,
  optionalSecret,
  optionalText,
  portNumber,
} from './EnvValidators.rules';
import { ENV_RULES, requireRootCertificateForVerifyFull } from './Env.rules';

/** True for a bare http(s) origin: no path, query, fragment or trailing slash. */
function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ALLOWED_ORIGIN_PROTOCOLS.includes(url.protocol) && url.origin === value
    );
  } catch {
    return false;
  }
}

/** Optional exact origin (scheme + host [+ port]); empty = unset. */
const optionalOrigin = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine(isHttpOrigin, {
      message:
        'must be a bare http(s) origin, e.g. https://admin.example.com (no path or trailing slash)',
    })
    .optional(),
);

/** Optional positive-integer override of a rate-limit rule; empty = unset. */
const optionalRateLimit = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(MAX_RATE_LIMIT_OVERRIDE).optional(),
);

const rateLimitOverrideShape = Object.fromEntries(
  RATE_LIMIT_OVERRIDE_ENV_KEYS.map((key) => [key, optionalRateLimit]),
) as Record<RateLimitOverrideEnvKey, typeof optionalRateLimit>;

/** Key id env vars (JWT and TOTP encryption keys): header- and log-safe. */
const optionalKid = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(JWT_KID_PATTERN, {
      message: 'must be 1-64 characters of A-Z a-z 0-9 . _ -',
    })
    .optional(),
);

/**
 * The database keys alone, so the migration commands (init container) load
 * them without any app secret (ADR 0012 §4). `envSchema` spreads this shape.
 */
export const databaseEnvShape = {
  DB_HOST: z.string().min(1),
  DB_PORT: portNumber(CONFIG_DEFAULTS.DB_PORT),
  DB_NAME: z.string().min(1),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(DB_SSL_MODES).default(CONFIG_DEFAULTS.DB_SSL_MODE),
  ),
  DB_SSL_ROOT_CERT_PATH: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine(isAbsolute, { message: 'must be an absolute path' })
      .optional(),
  ),
};

export const databaseEnvSchema = z
  .object(databaseEnvShape)
  .superRefine(requireRootCertificateForVerifyFull);

/** Inferred from the plain object: the refinement above takes this type. */
export type DatabaseEnv = z.infer<z.ZodObject<typeof databaseEnvShape>>;

/**
 * Raw environment contract. Every key is listed in `.env.example`.
 * Production-only rules (D17) live in the `superRefine` below.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default(CONFIG_DEFAULTS.NODE_ENV),
    PORT: portNumber(CONFIG_DEFAULTS.PORT),
    ...databaseEnvShape,
    TRUST_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .default(CONFIG_DEFAULTS.TRUST_PROXY_HOPS),
    CLIENT_IP_HEADER: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[A-Za-z0-9-]+$/)
        .transform((header) => header.toLowerCase())
        .optional(),
    ),
    ALLOW_LOGIN_RATE_LIMIT_OVERRIDE: z.preprocess(
      emptyToUndefined,
      z.literal(LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN).optional(),
    ),
    ...rateLimitOverrideShape,
    ADMIN_ORIGIN: optionalOrigin,
    WEB_ORIGIN: optionalOrigin,
    MAIL_PROVIDER: z
      .enum(MAIL_PROVIDERS)
      .default(CONFIG_DEFAULTS.MAIL_PROVIDER),
    JWT_ACCESS_SECRET: optionalSecret,
    JWT_ACCESS_KID: optionalKid,
    OTP_PEPPER: optionalSecret,
    TOTP_ENC_KEY: optionalSecret,
    TOTP_ENC_KID: optionalKid,
    TOTP_ENC_PREVIOUS_KEY: optionalSecret,
    TOTP_ENC_PREVIOUS_KID: optionalKid,
    TOTP_ISSUER: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(TOTP_ISSUER_PATTERN, {
          message: `must be 1-${TOTP_ISSUER_MAX_LENGTH} characters without a colon`,
        })
        .optional(),
    ),
    SMTP_HOST: optionalText,
    SMTP_PORT: portNumber(CONFIG_DEFAULTS.SMTP_PORT),
    SMTP_SECURE: envBoolean(CONFIG_DEFAULTS.SMTP_SECURE),
    SMTP_USER: optionalText,
    SMTP_PASSWORD: optionalText,
    MAIL_FROM: optionalText,
    MEDIA_PROVIDER: z
      .enum(MEDIA_PROVIDERS)
      .default(CONFIG_DEFAULTS.MEDIA_PROVIDER),
    CLOUDINARY_CLOUD_NAME: optionalText,
    CLOUDINARY_API_KEY: optionalText,
    CLOUDINARY_API_SECRET: optionalText,
    CLOUDINARY_FOLDER: optionalText,
    OWNER_SETUP_TOKEN: optionalSecret,
    REVIEWER_FEATURE_ENABLED: envBoolean(
      CONFIG_DEFAULTS.REVIEWER_FEATURE_ENABLED,
    ),
    TURNSTILE_SECRET_KEY: optionalSecret,
    TURNSTILE_EXPECTED_HOSTNAME: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, {
          message: 'must be a bare hostname, e.g. domain.com',
        })
        .optional(),
    ),
    BACKUP_STORAGE_ENDPOINT: optionalOrigin,
    BACKUP_STORAGE_REGION: z.preprocess(
      emptyToUndefined,
      z.string().min(1).default(CONFIG_DEFAULTS.BACKUP_STORAGE_REGION),
    ),
    BACKUP_STORAGE_BUCKET: optionalText,
    BACKUP_STORAGE_PREFIX: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(BACKUP_STORAGE_PREFIX_PATTERN, {
          message: 'must end with / and not start with /, e.g. postgres/',
        })
        .default(CONFIG_DEFAULTS.BACKUP_STORAGE_PREFIX),
    ),
    BACKUP_STORAGE_ACCESS_KEY_ID: optionalSecret,
    BACKUP_STORAGE_SECRET_ACCESS_KEY: optionalSecret,
  })
  .superRefine((env, ctx) => {
    for (const rule of ENV_RULES) rule(env, ctx);
  });

export type Env = z.infer<typeof envSchema>;

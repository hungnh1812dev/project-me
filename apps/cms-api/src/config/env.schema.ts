import { z } from 'zod';

import {
  ALLOWED_ORIGIN_PROTOCOLS,
  CONFIG_DEFAULTS,
  JWT_KID_PATTERN,
  LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN,
  MAIL_PROVIDERS,
  MAX_PORT,
  MAX_RATE_LIMIT_OVERRIDE,
  MIN_SECRET_BYTES,
  NODE_ENVS,
  SECRET_ENV_KEYS,
  TOTP_ISSUER_MAX_LENGTH,
  TOTP_ISSUER_PATTERN,
} from './config.constants';

const optionalSecret = z.string().min(1).optional();

const emptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

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

/** Login limit overrides (T18b): refused in production unless explicitly opted in, so a stray value can't weaken D7. */
const RATE_LIMIT_OVERRIDE_KEYS = [
  'LOGIN_RATE_LIMIT_IP',
  'LOGIN_RATE_LIMIT_EMAIL',
] as const;

/** Keys that are optional in development but required in production. */
const PRODUCTION_REQUIRED_KEYS = [
  'ADMIN_ORIGIN',
  'WEB_ORIGIN',
  'JWT_ACCESS_KID',
  'TOTP_ENC_KID',
] as const;

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

/** Keys required whenever MAIL_PROVIDER=smtp (any NODE_ENV). */
const SMTP_REQUIRED_KEYS = ['SMTP_HOST', 'MAIL_FROM'] as const;

/**
 * Raw environment contract. Every key is listed in `.env.example`.
 * Production-only rules (D17) live in the `superRefine` below.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default(CONFIG_DEFAULTS.NODE_ENV),
    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PORT)
      .default(CONFIG_DEFAULTS.PORT),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
    LOGIN_RATE_LIMIT_IP: optionalRateLimit,
    LOGIN_RATE_LIMIT_EMAIL: optionalRateLimit,
    ADMIN_ORIGIN: optionalOrigin,
    WEB_ORIGIN: optionalOrigin,
    MAIL_PROVIDER: z
      .enum(MAIL_PROVIDERS)
      .default(CONFIG_DEFAULTS.MAIL_PROVIDER),
    JWT_ACCESS_SECRET: z.preprocess(emptyToUndefined, optionalSecret),
    JWT_ACCESS_KID: optionalKid,
    OTP_PEPPER: z.preprocess(emptyToUndefined, optionalSecret),
    TOTP_ENC_KEY: z.preprocess(emptyToUndefined, optionalSecret),
    TOTP_ENC_KID: optionalKid,
    TOTP_ENC_PREVIOUS_KEY: z.preprocess(emptyToUndefined, optionalSecret),
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
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PORT: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_PORT)
        .default(CONFIG_DEFAULTS.SMTP_PORT),
    ),
    SMTP_SECURE: z.preprocess(
      emptyToUndefined,
      z.stringbool().default(CONFIG_DEFAULTS.SMTP_SECURE),
    ),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    MAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_PROVIDER === 'smtp') {
      for (const key of SMTP_REQUIRED_KEYS) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when MAIL_PROVIDER=smtp`,
          });
        }
      }
    }
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message:
          'SMTP_USER and SMTP_PASSWORD must be set together or both left empty',
      });
    }

    if (
      (env.TOTP_ENC_PREVIOUS_KEY === undefined) !==
      (env.TOTP_ENC_PREVIOUS_KID === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENC_PREVIOUS_KID'],
        message:
          'TOTP_ENC_PREVIOUS_KEY and TOTP_ENC_PREVIOUS_KID must be set together or both left empty',
      });
    }
    const totpEncKid = env.TOTP_ENC_KID ?? CONFIG_DEFAULTS.TOTP_ENC_KID;
    if (env.TOTP_ENC_PREVIOUS_KID === totpEncKid) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENC_PREVIOUS_KID'],
        message: 'TOTP_ENC_PREVIOUS_KID must differ from TOTP_ENC_KID',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    for (const key of RATE_LIMIT_OVERRIDE_KEYS) {
      if (
        env[key] !== undefined &&
        env.ALLOW_LOGIN_RATE_LIMIT_OVERRIDE !== LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is not allowed in production without ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=${LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN}`,
        });
      }
    }

    if (env.MAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER'],
        message: 'MAIL_PROVIDER=console is not allowed in production',
      });
    }

    for (const key of PRODUCTION_REQUIRED_KEYS) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }

    for (const key of SECRET_ENV_KEYS) {
      const value = env[key];
      if (value === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      } else if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be at least ${MIN_SECRET_BYTES} bytes in production`,
        });
      }
    }
    if (
      env.TOTP_ENC_PREVIOUS_KEY !== undefined &&
      Buffer.byteLength(env.TOTP_ENC_PREVIOUS_KEY, 'utf8') < MIN_SECRET_BYTES
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOTP_ENC_PREVIOUS_KEY'],
        message: `TOTP_ENC_PREVIOUS_KEY must be at least ${MIN_SECRET_BYTES} bytes in production`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

import { z } from 'zod';

import {
  ALLOWED_ORIGIN_PROTOCOLS,
  CONFIG_DEFAULTS,
  JWT_KID_PATTERN,
  MAIL_PROVIDERS,
  MAX_PORT,
  MIN_SECRET_BYTES,
  NODE_ENVS,
  SECRET_ENV_KEYS,
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

/** Keys that are optional in development but required in production. */
const PRODUCTION_REQUIRED_KEYS = [
  'ADMIN_ORIGIN',
  'WEB_ORIGIN',
  'JWT_ACCESS_KID',
] as const;

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
    ADMIN_ORIGIN: optionalOrigin,
    WEB_ORIGIN: optionalOrigin,
    MAIL_PROVIDER: z
      .enum(MAIL_PROVIDERS)
      .default(CONFIG_DEFAULTS.MAIL_PROVIDER),
    JWT_ACCESS_SECRET: z.preprocess(emptyToUndefined, optionalSecret),
    JWT_ACCESS_KID: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(JWT_KID_PATTERN, {
          message: 'must be 1-64 characters of A-Z a-z 0-9 . _ -',
        })
        .optional(),
    ),
    OTP_PEPPER: z.preprocess(emptyToUndefined, optionalSecret),
    TOTP_ENC_KEY: z.preprocess(emptyToUndefined, optionalSecret),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

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
  });

export type Env = z.infer<typeof envSchema>;

import { z } from 'zod';

import {
  ALLOWED_ORIGIN_PROTOCOLS,
  CONFIG_DEFAULTS,
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
    ADMIN_ORIGIN: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(isHttpOrigin, {
          message:
            'must be a bare http(s) origin, e.g. https://admin.example.com (no path or trailing slash)',
        })
        .optional(),
    ),
    MAIL_PROVIDER: z
      .enum(MAIL_PROVIDERS)
      .default(CONFIG_DEFAULTS.MAIL_PROVIDER),
    JWT_ACCESS_SECRET: z.preprocess(emptyToUndefined, optionalSecret),
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

    if (env.ADMIN_ORIGIN === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_ORIGIN'],
        message: 'ADMIN_ORIGIN is required in production',
      });
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

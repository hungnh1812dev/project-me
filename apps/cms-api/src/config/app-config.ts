import { z } from 'zod';

import type { DatabaseConfig } from '../infrastructure/database/database-config';
import {
  CONFIG_DEFAULTS,
  RATE_LIMIT_OVERRIDE_ENV_KEYS,
  REDACTED,
  type RateLimitOverrideEnvKey,
} from './config.constants';
import { envSchema, type Env } from './env.schema';

export interface IAppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly http: {
    readonly port: number;
    readonly trustProxyHops: number;
    readonly clientIpHeader: string | undefined;
  };
  readonly cors: {
    /** Exact origins allowed to call the API cross-origin with credentials. Empty = CORS off. */
    readonly allowedOrigins: readonly string[];
  };
  readonly auth: {
    /**
     * D14: origins allowed to use the refresh cookie (`/auth/refresh`,
     * `/auth/logout`): web + admin. Empty = those endpoints always refuse.
     */
    readonly cookieOrigins: readonly string[];
    /** Key id of JWT_ACCESS_SECRET; signed into every token header (D9). */
    readonly jwtAccessKid: string;
    /** TOTP secret encryption (D8, T13). Keys live in `secrets`. */
    readonly totp: {
      /** Key id of TOTP_ENC_KEY; stored with every encrypted secret. */
      readonly encKid: string;
      /** Key id of TOTP_ENC_PREVIOUS_KEY (rotation); undefined = none. */
      readonly previousEncKid: string | undefined;
      /** Issuer shown in authenticator apps. */
      readonly issuer: string;
    };
  };
  readonly database: Readonly<DatabaseConfig>;
  readonly rateLimit: {
    /**
     * Limit per env key, replacing the default of the rule that declares it
     * (`RateLimitRule.limitOverrideEnvKey`). Empty = all defaults (T18b: the
     * smoke stack only).
     */
    readonly limitOverrides: Readonly<
      Partial<Record<RateLimitOverrideEnvKey, number>>
    >;
  };
  readonly mail: {
    readonly provider: Env['MAIL_PROVIDER'];
    /** `From` header of outgoing mail; required when the provider is smtp. */
    readonly from: string | undefined;
    /** Set only when MAIL_PROVIDER=smtp. */
    readonly smtp: SmtpConfig | undefined;
  };
  readonly media: {
    readonly provider: Env['MEDIA_PROVIDER'];
    /** Set only when MEDIA_PROVIDER=cloudinary. */
    readonly cloudinary: CloudinaryConfig | undefined;
  };
  readonly reviewer: {
    /** Hostname Turnstile replies must name (T31); undefined = not checked. */
    readonly turnstileExpectedHostname: string | undefined;
  };
  readonly secrets: {
    readonly jwtAccessSecret: string | undefined;
    readonly otpPepper: string | undefined;
    readonly totpEncKey: string | undefined;
    /** Previous TOTP_ENC_KEY, kept to decrypt secrets during a rotation. */
    readonly totpEncPreviousKey: string | undefined;
    /**
     * Cloudflare Turnstile secret key (T31). Optional: unset, reviewer
     * sessions are refused (503), never skipped.
     */
    readonly turnstileSecretKey: string | undefined;
    /**
     * One-time owner setup token (ADR 0005). Optional: unset, the setup
     * route is closed (404). Remove it after the owner exists.
     */
    readonly ownerSetupToken: string | undefined;
  };
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  /** true = TLS from the start (465); false = STARTTLS when offered. */
  readonly secure: boolean;
  /** Unset = no SMTP auth (e.g. Mailpit). */
  readonly auth:
    { readonly user: string; readonly password: string } | undefined;
}

export interface CloudinaryConfig {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  /** Folder every object is stored under; undefined = the account root. */
  readonly folder: string | undefined;
}

/** Thrown when the environment does not satisfy `envSchema`. Never includes values. */
export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigValidationError';
  }
}

type RawEnv = Readonly<Record<string, string | undefined>>;

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

function formatIssues(error: z.ZodError): string[] {
  // Only paths and messages: Zod messages never echo the input value here.
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Parses the raw environment into the frozen application config. */
export function loadAppConfig(rawEnv: RawEnv): IAppConfig {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(formatIssues(parsed.error));
  }
  const env = parsed.data;

  return deepFreeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    http: {
      port: env.PORT,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      clientIpHeader: env.CLIENT_IP_HEADER,
    },
    cors: {
      allowedOrigins: env.ADMIN_ORIGIN === undefined ? [] : [env.ADMIN_ORIGIN],
    },
    auth: {
      cookieOrigins: [env.WEB_ORIGIN, env.ADMIN_ORIGIN].filter(
        (origin): origin is string => origin !== undefined,
      ),
      // Production requires an explicit kid (env.schema.ts).
      jwtAccessKid: env.JWT_ACCESS_KID ?? CONFIG_DEFAULTS.JWT_ACCESS_KID,
      totp: {
        // Production requires an explicit kid (env.schema.ts).
        encKid: env.TOTP_ENC_KID ?? CONFIG_DEFAULTS.TOTP_ENC_KID,
        previousEncKid: env.TOTP_ENC_PREVIOUS_KID,
        issuer: env.TOTP_ISSUER ?? CONFIG_DEFAULTS.TOTP_ISSUER,
      },
    },
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USERNAME,
      password: env.DB_PASSWORD,
    },
    rateLimit: { limitOverrides: rateLimitOverridesOf(env) },
    mail: {
      provider: env.MAIL_PROVIDER,
      from: env.MAIL_FROM,
      smtp: smtpConfigOf(env),
    },
    media: {
      provider: env.MEDIA_PROVIDER,
      cloudinary: cloudinaryConfigOf(env),
    },
    reviewer: { turnstileExpectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME },
    secrets: {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      otpPepper: env.OTP_PEPPER,
      totpEncKey: env.TOTP_ENC_KEY,
      totpEncPreviousKey: env.TOTP_ENC_PREVIOUS_KEY,
      turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
      ownerSetupToken: env.OWNER_SETUP_TOKEN,
    },
  });
}

function rateLimitOverridesOf(
  env: Env,
): Partial<Record<RateLimitOverrideEnvKey, number>> {
  return Object.fromEntries(
    RATE_LIMIT_OVERRIDE_ENV_KEYS.flatMap((key) => {
      const limit = env[key];
      return limit === undefined ? [] : [[key, limit]];
    }),
  );
}

function cloudinaryConfigOf(env: Env): CloudinaryConfig | undefined {
  // env.schema.ts guarantees the three keys when the provider is cloudinary.
  if (
    env.MEDIA_PROVIDER !== 'cloudinary' ||
    env.CLOUDINARY_CLOUD_NAME === undefined ||
    env.CLOUDINARY_API_KEY === undefined ||
    env.CLOUDINARY_API_SECRET === undefined
  ) {
    return undefined;
  }
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    folder: env.CLOUDINARY_FOLDER,
  };
}

function smtpConfigOf(env: Env): SmtpConfig | undefined {
  // env.schema.ts guarantees SMTP_HOST when the provider is smtp.
  if (env.MAIL_PROVIDER !== 'smtp' || env.SMTP_HOST === undefined) {
    return undefined;
  }
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER === undefined || env.SMTP_PASSWORD === undefined
        ? undefined
        : { user: env.SMTP_USER, password: env.SMTP_PASSWORD },
  };
}

/** Loggable view of the config: secrets show only whether they are set. */
export function summarizeConfig(config: IAppConfig): Record<string, unknown> {
  const secretState = (value: string | undefined): string =>
    value === undefined ? 'unset' : REDACTED;

  return {
    env: config.env,
    http: config.http,
    cors: config.cors,
    auth: config.auth,
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: REDACTED,
    },
    rateLimit: config.rateLimit,
    mail: {
      provider: config.mail.provider,
      from: config.mail.from,
      smtp:
        config.mail.smtp === undefined
          ? undefined
          : {
              host: config.mail.smtp.host,
              port: config.mail.smtp.port,
              secure: config.mail.smtp.secure,
              user: config.mail.smtp.auth?.user,
              password: secretState(config.mail.smtp.auth?.password),
            },
    },
    media: {
      provider: config.media.provider,
      cloudinary:
        config.media.cloudinary === undefined
          ? undefined
          : {
              cloudName: config.media.cloudinary.cloudName,
              apiKey: secretState(config.media.cloudinary.apiKey),
              apiSecret: secretState(config.media.cloudinary.apiSecret),
              folder: config.media.cloudinary.folder,
            },
    },
    reviewer: config.reviewer,
    secrets: {
      jwtAccessSecret: secretState(config.secrets.jwtAccessSecret),
      otpPepper: secretState(config.secrets.otpPepper),
      totpEncKey: secretState(config.secrets.totpEncKey),
      totpEncPreviousKey: secretState(config.secrets.totpEncPreviousKey),
      turnstileSecretKey: secretState(config.secrets.turnstileSecretKey),
      ownerSetupToken: secretState(config.secrets.ownerSetupToken),
    },
  };
}

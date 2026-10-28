import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type {
  DatabaseConfig,
  DatabaseTls,
} from '../infrastructure/database/DatabaseConfig.rules';
import {
  CONFIG_DEFAULTS,
  RATE_LIMIT_OVERRIDE_ENV_KEYS,
  type RateLimitOverrideEnvKey,
} from './Config.constants';
import {
  databaseEnvSchema,
  envSchema,
  type DatabaseEnv,
  type Env,
} from './Env.schema';

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
    /** TOTP secret encryption (D8). Keys live in `secrets`. */
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
     * (`RateLimitRule.limitOverrideEnvKey`). Empty = all defaults (used by the smoke
     * stack only).
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
  /** Set only when the backup bucket keys are set (ADR 0013); undefined = feature off. */
  readonly backups: BackupStorageConfig | undefined;
  readonly reviewer: {
    /** Hostname Turnstile replies must name; undefined = not checked. */
    readonly turnstileExpectedHostname: string | undefined;
  };
  readonly secrets: {
    readonly jwtAccessSecret: string | undefined;
    readonly otpPepper: string | undefined;
    readonly totpEncKey: string | undefined;
    /** Previous TOTP_ENC_KEY, kept to decrypt secrets during a rotation. */
    readonly totpEncPreviousKey: string | undefined;
    /**
     * Cloudflare Turnstile secret key. Optional: unset, reviewer
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

export interface BackupStorageConfig {
  /** S3 API origin; for R2 the `<account-id>.r2.cloudflarestorage.com` host. */
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  /** Always ends with `/`. */
  readonly prefix: string;
  /** Read-only token (list + get), separate from the backup job's credential. */
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
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

/**
 * Parses only the DB_* keys. For the migration commands, which run without
 * the app secrets (ADR 0012 §4).
 */
export function loadDatabaseConfig(rawEnv: RawEnv): Readonly<DatabaseConfig> {
  const parsed = databaseEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigValidationError(formatIssues(parsed.error));
  }
  return deepFreeze(databaseConfigOf(parsed.data));
}

function databaseConfigOf(env: DatabaseEnv): DatabaseConfig {
  const tls = databaseTlsOf(env);
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    ...(tls === undefined ? {} : { tls }),
  };
}

const PEM_CERTIFICATE_MARKER = '-----BEGIN CERTIFICATE-----';

function databaseTlsOf(env: DatabaseEnv): DatabaseTls | undefined {
  if (env.DB_SSL_MODE === 'disable') return undefined;
  if (env.DB_SSL_MODE === 'require') return { mode: 'require' };
  return {
    mode: 'verify-full',
    // The schema guarantees the path for verify-full.
    rootCertificatePem: readRootCertificate(env.DB_SSL_ROOT_CERT_PATH ?? ''),
  };
}

/** Errors name the key only: never the path's content or the file's. */
function readRootCertificate(path: string): string {
  let pem: string;
  try {
    pem = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigValidationError([
      'DB_SSL_ROOT_CERT_PATH: the file cannot be read',
    ]);
  }
  if (!pem.includes(PEM_CERTIFICATE_MARKER)) {
    throw new ConfigValidationError([
      'DB_SSL_ROOT_CERT_PATH: the file holds no PEM certificate',
    ]);
  }
  return pem;
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
      // Production requires an explicit kid (Env.schema.ts).
      jwtAccessKid: env.JWT_ACCESS_KID ?? CONFIG_DEFAULTS.JWT_ACCESS_KID,
      totp: {
        // Production requires an explicit kid (Env.schema.ts).
        encKid: env.TOTP_ENC_KID ?? CONFIG_DEFAULTS.TOTP_ENC_KID,
        previousEncKid: env.TOTP_ENC_PREVIOUS_KID,
        issuer: env.TOTP_ISSUER ?? CONFIG_DEFAULTS.TOTP_ISSUER,
      },
    },
    database: databaseConfigOf(env),
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
    backups: backupStorageConfigOf(env),
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
  // Env.schema.ts guarantees the three keys when the provider is cloudinary.
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

function backupStorageConfigOf(env: Env): BackupStorageConfig | undefined {
  // Env.rules.ts guarantees the four keys together.
  if (
    env.BACKUP_STORAGE_ENDPOINT === undefined ||
    env.BACKUP_STORAGE_BUCKET === undefined ||
    env.BACKUP_STORAGE_ACCESS_KEY_ID === undefined ||
    env.BACKUP_STORAGE_SECRET_ACCESS_KEY === undefined
  ) {
    return undefined;
  }
  return {
    endpoint: env.BACKUP_STORAGE_ENDPOINT,
    region: env.BACKUP_STORAGE_REGION,
    bucket: env.BACKUP_STORAGE_BUCKET,
    prefix: env.BACKUP_STORAGE_PREFIX,
    accessKeyId: env.BACKUP_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.BACKUP_STORAGE_SECRET_ACCESS_KEY,
  };
}

function smtpConfigOf(env: Env): SmtpConfig | undefined {
  // Env.schema.ts guarantees SMTP_HOST when the provider is smtp.
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

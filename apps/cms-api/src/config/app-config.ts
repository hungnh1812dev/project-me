import { z } from 'zod';

import { CONFIG_DEFAULTS, REDACTED } from './config.constants';
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
  };
  readonly database: {
    readonly url: string;
  };
  readonly mail: {
    readonly provider: Env['MAIL_PROVIDER'];
    /** `From` header of outgoing mail; required when the provider is smtp. */
    readonly from: string | undefined;
    /** Set only when MAIL_PROVIDER=smtp. */
    readonly smtp: SmtpConfig | undefined;
  };
  readonly secrets: {
    readonly jwtAccessSecret: string | undefined;
    readonly otpPepper: string | undefined;
    readonly totpEncKey: string | undefined;
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
    },
    database: { url: env.DATABASE_URL },
    mail: {
      provider: env.MAIL_PROVIDER,
      from: env.MAIL_FROM,
      smtp: smtpConfigOf(env),
    },
    secrets: {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      otpPepper: env.OTP_PEPPER,
      totpEncKey: env.TOTP_ENC_KEY,
    },
  });
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

/** Keeps scheme, host and database; drops credentials and query (may hold a password). */
function redactDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const credentials = parsed.username || parsed.password ? `${REDACTED}@` : '';
  return `${parsed.protocol}//${credentials}${parsed.host}${parsed.pathname}`;
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
    database: { url: redactDatabaseUrl(config.database.url) },
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
    secrets: {
      jwtAccessSecret: secretState(config.secrets.jwtAccessSecret),
      otpPepper: secretState(config.secrets.otpPepper),
      totpEncKey: secretState(config.secrets.totpEncKey),
    },
  };
}

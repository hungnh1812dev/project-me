import { z } from 'zod';

import { REDACTED } from './config.constants';
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
  readonly database: {
    readonly url: string;
  };
  readonly mail: {
    readonly provider: Env['MAIL_PROVIDER'];
  };
  readonly secrets: {
    readonly jwtAccessSecret: string | undefined;
    readonly otpPepper: string | undefined;
    readonly totpEncKey: string | undefined;
  };
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
    database: { url: env.DATABASE_URL },
    mail: { provider: env.MAIL_PROVIDER },
    secrets: {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      otpPepper: env.OTP_PEPPER,
      totpEncKey: env.TOTP_ENC_KEY,
    },
  });
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
    database: { url: redactDatabaseUrl(config.database.url) },
    mail: config.mail,
    secrets: {
      jwtAccessSecret: secretState(config.secrets.jwtAccessSecret),
      otpPepper: secretState(config.secrets.otpPepper),
      totpEncKey: secretState(config.secrets.totpEncKey),
    },
  };
}

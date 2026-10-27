import type { z } from 'zod';

import {
  BACKUP_STORAGE_REQUIRED_KEYS,
  CONFIG_DEFAULTS,
  LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN,
  MIN_SECRET_BYTES,
  OPTIONAL_SECRET_ENV_KEYS,
  RATE_LIMIT_OVERRIDE_ENV_KEYS,
  SECRET_ENV_KEYS,
} from './Config.constants';
import type { Env } from './Env.schema';

type EnvIssueContext = z.RefinementCtx;
type EnvRule = (env: Env, ctx: EnvIssueContext) => void;

/** Keys that are optional in development but required in production. */
const PRODUCTION_REQUIRED_KEYS = [
  'ADMIN_ORIGIN',
  'WEB_ORIGIN',
  'JWT_ACCESS_KID',
  'TOTP_ENC_KID',
] as const;

/** Keys required whenever MEDIA_PROVIDER=cloudinary (any NODE_ENV). */
const CLOUDINARY_REQUIRED_KEYS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

/** Keys required whenever MAIL_PROVIDER=smtp (any NODE_ENV). */
const SMTP_REQUIRED_KEYS = ['SMTP_HOST', 'MAIL_FROM'] as const;

function addIssue(ctx: EnvIssueContext, key: string, message: string): void {
  ctx.addIssue({ code: 'custom', path: [key], message });
}

function addMissingIssues(
  env: Env,
  ctx: EnvIssueContext,
  keys: readonly (keyof Env)[],
  message: (key: string) => string,
): void {
  for (const key of keys) {
    if (env[key] === undefined) addIssue(ctx, key, message(key));
  }
}

function addShortSecretIssue(
  ctx: EnvIssueContext,
  key: string,
  value: string,
): void {
  if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
    addIssue(
      ctx,
      key,
      `${key} must be at least ${MIN_SECRET_BYTES} bytes in production`,
    );
  }
}

const requireSmtpSettings: EnvRule = (env, ctx) => {
  if (env.MAIL_PROVIDER !== 'smtp') return;
  addMissingIssues(
    env,
    ctx,
    SMTP_REQUIRED_KEYS,
    (key) => `${key} is required when MAIL_PROVIDER=smtp`,
  );
};

const requireCloudinarySettings: EnvRule = (env, ctx) => {
  if (env.MEDIA_PROVIDER !== 'cloudinary') return;
  addMissingIssues(
    env,
    ctx,
    CLOUDINARY_REQUIRED_KEYS,
    (key) => `${key} is required when MEDIA_PROVIDER=cloudinary`,
  );
};

const requireSmtpCredentialsTogether: EnvRule = (env, ctx) => {
  if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
    addIssue(
      ctx,
      'SMTP_PASSWORD',
      'SMTP_USER and SMTP_PASSWORD must be set together or both left empty',
    );
  }
};

const requireBackupStorageKeysTogether: EnvRule = (env, ctx) => {
  const isAnySet = BACKUP_STORAGE_REQUIRED_KEYS.some(
    (key) => env[key] !== undefined,
  );
  if (!isAnySet) return;
  addMissingIssues(
    env,
    ctx,
    BACKUP_STORAGE_REQUIRED_KEYS,
    (key) =>
      `${key} is required when any other BACKUP_STORAGE_* key is set (all four or none)`,
  );
};

const requirePreviousTotpKeyPair: EnvRule = (env, ctx) => {
  if (
    (env.TOTP_ENC_PREVIOUS_KEY === undefined) !==
    (env.TOTP_ENC_PREVIOUS_KID === undefined)
  ) {
    addIssue(
      ctx,
      'TOTP_ENC_PREVIOUS_KID',
      'TOTP_ENC_PREVIOUS_KEY and TOTP_ENC_PREVIOUS_KID must be set together or both left empty',
    );
  }
};

const requireDistinctPreviousTotpKid: EnvRule = (env, ctx) => {
  const totpEncKid = env.TOTP_ENC_KID ?? CONFIG_DEFAULTS.TOTP_ENC_KID;
  if (env.TOTP_ENC_PREVIOUS_KID === totpEncKid) {
    addIssue(
      ctx,
      'TOTP_ENC_PREVIOUS_KID',
      'TOTP_ENC_PREVIOUS_KID must differ from TOTP_ENC_KID',
    );
  }
};

const rejectRateLimitOverrideWithoutOptIn: EnvRule = (env, ctx) => {
  if (env.ALLOW_LOGIN_RATE_LIMIT_OVERRIDE === LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN)
    return;
  for (const key of RATE_LIMIT_OVERRIDE_ENV_KEYS) {
    if (env[key] !== undefined) {
      addIssue(
        ctx,
        key,
        `${key} is not allowed in production without ALLOW_LOGIN_RATE_LIMIT_OVERRIDE=${LOGIN_RATE_LIMIT_OVERRIDE_OPT_IN}`,
      );
    }
  }
};

const rejectFakeMediaProvider: EnvRule = (env, ctx) => {
  if (env.MEDIA_PROVIDER === 'fake') {
    addIssue(
      ctx,
      'MEDIA_PROVIDER',
      'MEDIA_PROVIDER=fake is not allowed in production',
    );
  }
};

const rejectConsoleMailProvider: EnvRule = (env, ctx) => {
  if (env.MAIL_PROVIDER === 'console') {
    addIssue(
      ctx,
      'MAIL_PROVIDER',
      'MAIL_PROVIDER=console is not allowed in production',
    );
  }
};

const requireHttpsBackupEndpoint: EnvRule = (env, ctx) => {
  const endpoint = env.BACKUP_STORAGE_ENDPOINT;
  if (endpoint !== undefined && !endpoint.startsWith('https:')) {
    addIssue(
      ctx,
      'BACKUP_STORAGE_ENDPOINT',
      'BACKUP_STORAGE_ENDPOINT must be an https: origin in production',
    );
  }
};

const requireProductionKeys: EnvRule = (env, ctx) => {
  addMissingIssues(
    env,
    ctx,
    PRODUCTION_REQUIRED_KEYS,
    (key) => `${key} is required in production`,
  );
};

const requireStrongSecrets: EnvRule = (env, ctx) => {
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (value === undefined) {
      addIssue(ctx, key, `${key} is required in production`);
    } else {
      addShortSecretIssue(ctx, key, value);
    }
  }
  for (const key of OPTIONAL_SECRET_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) addShortSecretIssue(ctx, key, value);
  }
};

const PRODUCTION_RULES: readonly EnvRule[] = [
  rejectRateLimitOverrideWithoutOptIn,
  rejectFakeMediaProvider,
  rejectConsoleMailProvider,
  requireHttpsBackupEndpoint,
  requireProductionKeys,
  requireStrongSecrets,
];

const ALWAYS_RULES: readonly EnvRule[] = [
  requireSmtpSettings,
  requireCloudinarySettings,
  requireSmtpCredentialsTogether,
  requireBackupStorageKeysTogether,
  requirePreviousTotpKeyPair,
  requireDistinctPreviousTotpKid,
];

const runProductionRules: EnvRule = (env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const rule of PRODUCTION_RULES) rule(env, ctx);
};

/** Cross-field rules in the order their messages are reported. */
export const ENV_RULES: readonly EnvRule[] = [
  ...ALWAYS_RULES,
  runProductionRules,
];

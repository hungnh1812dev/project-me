import {
  devEnv,
  productionEnv,
  TEST_DB_HOST,
  TEST_DB_NAME,
  TEST_DB_PASSWORD,
  TEST_DB_USERNAME,
  TEST_MAIL_FROM,
  TEST_SECRET_32_BYTES,
  TEST_SMTP_HOST,
  TEST_SMTP_PASSWORD,
  TEST_SMTP_USER,
} from '../../test/fixtures/env.fixture';
import { loadAppConfig } from './AppConfig.setup';
import { summarizeConfig } from './ConfigSummary.rules';
import {
  CONFIG_DEFAULTS,
  OPTIONAL_SECRET_ENV_KEYS,
  REDACTED,
  SECRET_ENV_KEYS,
} from './Config.constants';
import { envSchema } from './Env.schema';

/** Env keys whose values must never reach the log, beyond the secret lists. */
const OTHER_SECRET_ENV_KEYS = [
  'DB_PASSWORD',
  'SMTP_PASSWORD',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'TURNSTILE_SECRET_KEY',
] as const;

const SECRET_KEYS_IN_SUMMARY: readonly string[] = [
  ...SECRET_ENV_KEYS,
  ...OPTIONAL_SECRET_ENV_KEYS,
  ...OTHER_SECRET_ENV_KEYS,
];

/** Valid values for keys whose format is not free text. */
const FORMATTED_SENTINELS: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  PORT: '3101',
  DB_PORT: '3102',
  TRUST_PROXY_HOPS: '3',
  SMTP_PORT: '3103',
  SMTP_SECURE: 'true',
  MAIL_PROVIDER: 'smtp',
  MEDIA_PROVIDER: 'cloudinary',
  ADMIN_ORIGIN: 'https://sentinel-admin.example.test',
  WEB_ORIGIN: 'https://sentinel-web.example.test',
  ALLOW_LOGIN_RATE_LIMIT_OVERRIDE: 'smoke',
  LOGIN_RATE_LIMIT_IP: '3104',
  LOGIN_RATE_LIMIT_EMAIL: '3105',
  REFRESH_RATE_LIMIT_IP: '3106',
};

/** One unique, format-valid value per schema key. */
function sentinelEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.keys(envSchema.shape).map((key) => [
      key,
      FORMATTED_SENTINELS[key] ??
        `sentinel-${key.toLowerCase().replaceAll('_', '-')}-value`,
    ]),
  );
}

describe('summarizeConfig', () => {
  it('redacts secrets and database credentials', () => {
    const config = loadAppConfig(productionEnv());
    const summary = JSON.stringify(summarizeConfig(config));
    expect(summary).not.toContain(TEST_SECRET_32_BYTES);
    expect(summary).not.toContain(TEST_DB_PASSWORD);
    expect(summarizeConfig(config).database).toEqual({
      host: TEST_DB_HOST,
      port: 5432,
      database: TEST_DB_NAME,
      user: TEST_DB_USERNAME,
      password: REDACTED,
    });
  });

  it('redacts the SMTP password', () => {
    const config = loadAppConfig(
      productionEnv({
        SMTP_USER: TEST_SMTP_USER,
        SMTP_PASSWORD: TEST_SMTP_PASSWORD,
      }),
    );
    const summary = summarizeConfig(config);
    expect(JSON.stringify(summary)).not.toContain(TEST_SMTP_PASSWORD);
    expect(summary.mail).toEqual({
      provider: 'smtp',
      from: TEST_MAIL_FROM,
      smtp: {
        host: TEST_SMTP_HOST,
        port: CONFIG_DEFAULTS.SMTP_PORT,
        secure: CONFIG_DEFAULTS.SMTP_SECURE,
        user: TEST_SMTP_USER,
        password: REDACTED,
      },
    });
  });

  it('shows unset secrets as unset', () => {
    const summary = summarizeConfig(loadAppConfig(devEnv()));
    expect(summary.secrets).toEqual({
      jwtAccessSecret: 'unset',
      otpPepper: 'unset',
      totpEncKey: 'unset',
      totpEncPreviousKey: 'unset',
      turnstileSecretKey: 'unset',
      ownerSetupToken: 'unset',
    });
  });

  describe('sentinel values', () => {
    const env = sentinelEnv();
    const summary = JSON.stringify(summarizeConfig(loadAppConfig(env)));

    it('gives every schema key a unique value', () => {
      const values = Object.values(env);
      expect(new Set(values).size).toBe(values.length);
    });

    it.each(SECRET_KEYS_IN_SUMMARY)('does not log %s', (key) => {
      expect(Object.keys(env)).toContain(key);
      expect(summary).not.toContain(env[key]);
    });
  });
});

/**
 * Test-only environment values. None of these are real credentials.
 */
export const TEST_SECRET_32_BYTES = 'test-secret-value-0123456789abcdef';
export const TEST_SHORT_SECRET = 'too-short-secret';

export const TEST_DB_HOST = '127.0.0.1';
export const TEST_DB_PORT = '5432';
export const TEST_DB_NAME = 'abyss_test';
export const TEST_DB_USERNAME = 'abyss_test';
export const TEST_DB_PASSWORD = 'abyss_test_pw';

/** DB_* env values for a connection URL (Testcontainers hands out URLs). */
export function dbEnvOf(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    DB_HOST: url.hostname,
    DB_PORT: url.port,
    DB_NAME: decodeURIComponent(url.pathname.slice(1)),
    DB_USERNAME: decodeURIComponent(url.username),
    DB_PASSWORD: decodeURIComponent(url.password),
  };
}

export const TEST_DB_ENV: Record<string, string> = {
  DB_HOST: TEST_DB_HOST,
  DB_PORT: TEST_DB_PORT,
  DB_NAME: TEST_DB_NAME,
  DB_USERNAME: TEST_DB_USERNAME,
  DB_PASSWORD: TEST_DB_PASSWORD,
};

export const TEST_ADMIN_ORIGIN = 'https://admin.example.test';
export const TEST_WEB_ORIGIN = 'https://example.test';
export const TEST_JWT_KID = 'test-kid-1';
export const TEST_TOTP_ENC_KID = 'test-totp-kid-1';
export const TEST_TOTP_ENC_PREVIOUS_KID = 'test-totp-kid-0';
export const TEST_SMTP_HOST = 'smtp.example.test';
export const TEST_MAIL_FROM = 'Abyss CMS <no-reply@example.test>';
export const TEST_SMTP_USER = 'mailer@example.test';
export const TEST_SMTP_PASSWORD = 'smtp-app-password';

export const TEST_CLOUDINARY_CLOUD_NAME = 'test-cloud';
export const TEST_CLOUDINARY_API_KEY = 'test-cloudinary-key';
export const TEST_CLOUDINARY_API_SECRET = 'test-cloudinary-secret';

export function devEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { NODE_ENV: 'test', ...TEST_DB_ENV, ...overrides };
}

export function productionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    ...TEST_DB_ENV,
    MAIL_PROVIDER: 'smtp',
    MEDIA_PROVIDER: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: TEST_CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: TEST_CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: TEST_CLOUDINARY_API_SECRET,
    SMTP_HOST: TEST_SMTP_HOST,
    MAIL_FROM: TEST_MAIL_FROM,
    ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    JWT_ACCESS_KID: TEST_JWT_KID,
    JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
    OTP_PEPPER: TEST_SECRET_32_BYTES,
    TOTP_ENC_KEY: TEST_SECRET_32_BYTES,
    TOTP_ENC_KID: TEST_TOTP_ENC_KID,
    ...overrides,
  };
}

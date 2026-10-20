/**
 * Test-only environment values. None of these are real credentials.
 */
export const TEST_SECRET_32_BYTES = 'test-secret-value-0123456789abcdef';
export const TEST_SHORT_SECRET = 'too-short-secret';

export const TEST_DATABASE_URL =
  'postgresql://abyss_test:abyss_test_pw@127.0.0.1:5432/abyss_test';

export const TEST_ADMIN_ORIGIN = 'https://admin.example.test';
export const TEST_WEB_ORIGIN = 'https://example.test';
export const TEST_JWT_KID = 'test-kid-1';

export function devEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, ...overrides };
}

export function productionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: TEST_DATABASE_URL,
    MAIL_PROVIDER: 'smtp',
    ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    JWT_ACCESS_KID: TEST_JWT_KID,
    JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
    OTP_PEPPER: TEST_SECRET_32_BYTES,
    TOTP_ENC_KEY: TEST_SECRET_32_BYTES,
    ...overrides,
  };
}

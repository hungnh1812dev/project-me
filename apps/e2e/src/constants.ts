/** Name of the refresh cookie set by cms-api (SPEC §6). */
export const REFRESH_COOKIE_NAME = '__Secure-abyss_rt';

/** Path the refresh cookie is scoped to, relative to the API base URL. */
export const AUTH_REFRESH_PATH = '/auth/refresh';

/** Retries on CI only, where the stack may be slower to warm up. */
export const CI_RETRIES = 1;

/** Per-assertion timeout; the smoke stack runs production builds locally. */
export const EXPECT_TIMEOUT_MS = 10_000;

/** Password endpoints, relative to the API base URL (SPEC §9). */
export const PASSWORD_PATHS = {
  REQUEST_OTP: '/auth/password/request-otp',
  RESET: '/auth/password/reset',
} as const;

/** Mailpit REST API paths (https://mailpit.axllent.org/docs/api-v1/). */
export const MAILPIT_API = {
  SEARCH: '/api/v1/search',
  MESSAGE: '/api/v1/message',
} as const;

/** How long to wait for an OTP email to reach Mailpit, and how often to look. */
export const MAIL_WAIT_TIMEOUT_MS = 15_000;
export const MAIL_POLL_INTERVAL_MS = 500;

/** Digits of the emailed code; mirrors cms-api (checked by the constants contract spec). */
export const OTP_DIGITS = 6;

/** cms-api emails the code on a line of its own. */
export const OTP_IN_MAIL = new RegExp(`^(\\d{${OTP_DIGITS}})$`, 'm');

/** Reviewer notes limit; mirrors cms-api (checked by the constants contract spec). */
export const NOTES_MAX_LENGTH = 500;

/** Only one worker: the reset spec changes the owner password other specs use. */
export const WORKERS = 1;

/** TOTP time step of cms-api (D8): codes change every 30 s. */
export const TOTP_PERIOD_SECONDS = 30;
export const MS_PER_SECOND = 1_000;

/**
 * The 2FA spec waits up to two TOTP steps for fresh codes (cms-api rejects a
 * reused step) and reads two emails, so it needs more than the default 30 s.
 */
export const TWO_FACTOR_TEST_TIMEOUT_MS = 180_000;

/** Smoke stack database container, used to seed media rows (no real uploads there). */
export const SMOKE_DB_CONTAINER = 'abyss-smoke-db-1';
export const SMOKE_DB_USER = 'abyss';
export const SMOKE_DB_NAME = 'abyss';

/** HTTP statuses the specs assert on. */
export const HTTP = {
  OK: 200,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
} as const;

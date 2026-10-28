/** Name of the refresh cookie set by cms-api (SPEC §6). */
export const REFRESH_COOKIE_NAME = '__Secure-abyss_rt';

/** Retries on CI only, where the stack may be slower to warm up. */
export const CI_RETRIES = 1;

/** Per-assertion timeout; the smoke stack runs production builds locally. */
export const EXPECT_TIMEOUT_MS = 10_000;

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

/** HTTP statuses the specs assert on. */
export const HTTP = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVER_ERROR: 500,
} as const;

/** Distinguishes this run's data from earlier runs against the same stack. */
export const RUN_ID = Date.now().toString(36);

/** Content type of the smoke stack with lists, rich text and relations. */
export const CV_PAGE_SLUG = 'cv-page';

/** Content type of the smoke stack with a media field and a list view. */
export const PROFILE_SLUG = 'profile';

const UUID_SEGMENT = '[0-9a-f-]{36}';

/** URL of an admin edit page for a document of `slug`. */
export const editUrlPattern = (slug: string): RegExp =>
  new RegExp(`/content/${slug}/${UUID_SEGMENT}$`);

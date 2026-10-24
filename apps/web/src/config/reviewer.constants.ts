/**
 * Reviewer access dialog. Limits mirror cms-api's
 * `REVIEWER_INPUT_LIMITS`; the server validates everything again.
 */
export const REVIEWER_INPUT_LIMITS = {
  VISITOR_ROLE_MAX_LENGTH: 64,
  PURPOSE_TAG_MAX_LENGTH: 40,
  PURPOSE_TAGS_MAX: 10,
  NOTES_MAX_LENGTH: 500,
} as const;

/** Form value of the "Other, free text" choice. */
export const REVIEWER_OTHER_VALUE = '__other__';

/** Visitor roles offered in the dialog. */
export const REVIEWER_VISITOR_ROLES = [
  'Recruiter',
  'Peer / colleague',
] as const;

/** Purpose tags offered in the dialog. */
export const REVIEWER_PURPOSE_TAGS = [
  'Hiring',
  'Project scoping',
  'Networking',
] as const;

/** How often the reviewer-enabled flag is re-read while the page is open. */
export const REVIEWER_STATUS_STALE_MS = 60_000;

/** `errorCode` values of cms-api reviewer failures the UI branches on. */
export const REVIEWER_ERROR_CODES = {
  DISABLED: 'REVIEWER_DISABLED',
  UNAVAILABLE: 'REVIEWER_UNAVAILABLE',
  TURNSTILE_FAILED: 'REVIEWER_TURNSTILE_FAILED',
  IP_LIMITED: 'REVIEWER_IP_LIMITED',
  CAPACITY_REACHED: 'REVIEWER_CAPACITY_REACHED',
} as const;

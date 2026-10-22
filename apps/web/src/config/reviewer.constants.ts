/**
 * Reviewer access dialog (T32). Limits mirror cms-api's
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

/** Visitor roles offered in the dialog (user answer, T32). */
export const REVIEWER_VISITOR_ROLES = [
  'Recruiter',
  'Peer / colleague',
] as const;

/** Purpose tags offered in the dialog (user answer, T32). */
export const REVIEWER_PURPOSE_TAGS = [
  'Hiring',
  'Project scoping',
  'Networking',
] as const;

/** How often the reviewer-enabled flag is re-read while the page is open. */
export const REVIEWER_STATUS_STALE_MS = 60_000;

/** Cloudflare Turnstile (explicit rendering). The only third-party origin. */
export const TURNSTILE = {
  SCRIPT_ORIGIN: 'https://challenges.cloudflare.com',
  SCRIPT_URL:
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
} as const;

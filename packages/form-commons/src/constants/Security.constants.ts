/** Meta tag the host page fills with its per-request CSP nonce. */
export const CSP_NONCE_META_NAME = 'csp-nonce';

/** Forms protected by the human check; the value is the Turnstile `action` and cms-api's form id. */
export const HUMAN_CHECK_FORMS = {
  LOGIN: 'login',
  TWO_FACTOR: 'two-factor',
  OWNER_SETUP: 'owner-setup',
  PASSWORD_RESET: 'password-reset',
} as const;

export type HumanCheckForm = (typeof HUMAN_CHECK_FORMS)[keyof typeof HUMAN_CHECK_FORMS];

/** JSON body field that carries the Turnstile token to cms-api. */
export const TURNSTILE_TOKEN_FIELD = 'turnstileToken';

/** Third-party origin Turnstile loads its script and challenge frame from (CSP `script-src` and `frame-src`). */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

/** Longest token Cloudflare documents. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

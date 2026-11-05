/** Authenticator and emailed login codes are both 6 digits (SPEC D8). */
export const LOGIN_CODE_LENGTH = 6;

/** Longest sign-in field the BFF accepts; cms-api's own caps. */
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;
/** A pasted code may carry spaces; cms-api trims it and rejects what is longer. */
export const TWO_FACTOR_CODE_MAX_LENGTH = LOGIN_CODE_LENGTH * 2;

/** 2FA methods cms-api offers (`two_fa_method`). */
export const TWO_FACTOR_METHODS = ['totp', 'email'] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];

/** Permission strings from `/auth/me` are `subject:action`. */
export const PERMISSION_STRING_SEPARATOR = ':';

/** The only action a reader role holds; any other action is privileged. */
export const READ_ACTION = 'read';

/** Scheme of the per-call `Authorization` header; never a client default. */
export const BEARER_PREFIX = 'Bearer ';

/** `errorCode` values of cms-api auth failures the UI branches on. */
export const API_ERROR_CODES = {
  INVALID_2FA_CODE: 'AUTH_INVALID_2FA_CODE',
  INVALID_TEMP_TOKEN: 'AUTH_INVALID_TEMP_TOKEN',
} as const;

/** Error codes of the BFF the sign-in UI branches on (ADR 0018 section 3). */
export const BFF_ERROR_CODES = {
  INVALID_CREDENTIALS: 'BFF_INVALID_CREDENTIALS',
  INVALID_TWO_FACTOR_CODE: 'BFF_INVALID_TWO_FACTOR_CODE',
  TWO_FACTOR_EXPIRED: 'BFF_TWO_FACTOR_EXPIRED',
  PRIVILEGED_ACCOUNT: 'BFF_PRIVILEGED_ACCOUNT',
  RATE_LIMITED: 'BFF_RATE_LIMITED',
  HUMAN_CHECK_FAILED: 'BFF_HUMAN_CHECK_FAILED',
  HUMAN_CHECK_UNAVAILABLE: 'BFF_HUMAN_CHECK_UNAVAILABLE',
} as const;

/** Name of the refresh cookie cms-api sets and reads (`Set-Cookie` / `Cookie`). */
export const CMS_API_REFRESH_COOKIE_NAME = '__Secure-abyss_rt';

/** Sealed session cookie of the BFF: the tokens of a signed-in visitor (ADR 0018 section 4). */
export const WEB_SESSION_COOKIE_NAME = '__Host-abyss_web_session';

/** Sealed cookie that carries the 2FA challenge between the sign-in step and the code step. */
export const TWO_FACTOR_COOKIE_NAME = '__Host-abyss_web_2fa';

export const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 300;

/** A session read refreshes the access token when it expires within this lead. */
export const ACCESS_REFRESH_LEAD_MS = 30_000;

/** A settled refresh answer is shared this long, so a race never presents a rotated token. */
export const REFRESH_RESULT_SHARE_MS = 10_000;

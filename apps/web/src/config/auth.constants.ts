/** Authenticator and emailed login codes are both 6 digits (SPEC D8). */
export const LOGIN_CODE_LENGTH = 6;

/** 2FA methods cms-api offers (`two_fa_method`). */
export const TWO_FACTOR_METHODS = ['totp', 'email'] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];

/** Permission strings from `/auth/me` are `subject:action` (T33a). */
export const PERMISSION_STRING_SEPARATOR = ':';

/** The only action a reader role holds; any other action is privileged. */
export const READ_ACTION = 'read';

/** Scheme of the per-call `Authorization` header; never a client default. */
export const BEARER_PREFIX = 'Bearer ';

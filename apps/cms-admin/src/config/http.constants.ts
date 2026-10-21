/** Abort API requests that take longer than this. */
export const API_TIMEOUT_MS = 10_000;

/** Retries for the health query before it shows the error state. */
export const HEALTH_QUERY_RETRY = 1;

/** Expected `status` value of a healthy health endpoint (SPEC §6). */
export const HEALTH_STATUS_OK = 'ok';

/** HTTP statuses the client reacts to. */
export const HTTP_STATUS = {
  /** First 4xx status. */
  CLIENT_ERROR_MIN: 400,
  /** First 5xx status. */
  SERVER_ERROR_MIN: 500,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
} as const;

/** Seconds to wait after a 429. Readable cross-origin only when cms-api exposes it. */
export const RETRY_AFTER_HEADER = 'retry-after';

/** `Authorization` header scheme for the in-memory access token (D14). */
export const BEARER_PREFIX = 'Bearer ';

/** `errorCode` values of cms-api the admin reacts to (SPEC §9). */
export const API_ERROR_CODES = {
  INVALID_OTP: 'AUTH_INVALID_OTP',
  WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  TOTP_REQUIRED: 'AUTH_TOTP_REQUIRED',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  INVALID_2FA_CODE: 'AUTH_INVALID_2FA_CODE',
  INVALID_TEMP_TOKEN: 'AUTH_INVALID_TEMP_TOKEN',
  TWO_FACTOR_ALREADY_ENABLED: 'AUTH_2FA_ALREADY_ENABLED',
  TWO_FACTOR_NOT_ENABLED: 'AUTH_2FA_NOT_ENABLED',
  TWO_FACTOR_SETUP_REQUIRED: 'AUTH_2FA_SETUP_REQUIRED',
  /** T17 accounts and roles API. */
  ACCESS_INVALID_REQUEST: 'ACCESS_INVALID_REQUEST',
  ACCESS_RANK_FORBIDDEN: 'ACCESS_RANK_FORBIDDEN',
  PERMISSION_NOT_HELD: 'PERMISSION_NOT_HELD',
  ACCOUNT_EMAIL_TAKEN: 'ACCOUNT_EMAIL_TAKEN',
  ACCOUNT_ALREADY_DISABLED: 'ACCOUNT_ALREADY_DISABLED',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NOT_ASSIGNABLE: 'ROLE_NOT_ASSIGNABLE',
} as const;

/** Milliseconds per second (Retry-After is in seconds). */
export const MS_PER_SECOND = 1_000;

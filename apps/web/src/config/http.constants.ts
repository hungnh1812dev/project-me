/** Abort API requests that take longer than this. */
export const API_TIMEOUT_MS = 10_000;

/** Retries for the health query before it shows the error state. */
export const HEALTH_QUERY_RETRY = 1;

/** Expected `status` value of a healthy health endpoint (SPEC §6). */
export const HEALTH_STATUS_OK = 'ok';

export const HTTP_STATUS = {
  TOO_MANY_REQUESTS: 429,
  CLIENT_ERROR_MIN: 400,
  SERVER_ERROR_MIN: 500,
} as const;

export const RETRY_AFTER_HEADER = 'retry-after';

export const SECONDS_PER_MINUTE = 60;
export const MS_PER_SECOND = 1000;

/** `errorCode` values of cms-api auth failures the UI branches on. */
export const API_ERROR_CODES = {
  INVALID_2FA_CODE: 'AUTH_INVALID_2FA_CODE',
  INVALID_TEMP_TOKEN: 'AUTH_INVALID_TEMP_TOKEN',
} as const;

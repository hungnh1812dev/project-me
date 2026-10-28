/** Abort API requests that take longer than this. */
export const API_TIMEOUT_MS = 10_000;

/** Retries for the health query before it shows the error state. */
export const HEALTH_QUERY_RETRY = 1;

/** Expected `status` value of a healthy health endpoint (SPEC §6). */
export const HEALTH_STATUS_OK = 'ok';

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  CLIENT_ERROR_MIN: 400,
  SERVER_ERROR_MIN: 500,
} as const;

/** Body type of every GraphQL request. */
export const JSON_MEDIA_TYPE = 'application/json';

export const RETRY_AFTER_HEADER = 'retry-after';

export const SECONDS_PER_MINUTE = 60;
export const MS_PER_SECOND = 1000;

/** Largest delay setTimeout accepts; a longer one fires at once (32-bit overflow). */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

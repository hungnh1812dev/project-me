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
  UNAUTHORIZED: 401,
  TOO_MANY_REQUESTS: 429,
} as const;

/** Seconds to wait after a 429. Readable cross-origin only when cms-api exposes it. */
export const RETRY_AFTER_HEADER = 'retry-after';

/** `Authorization` header scheme for the in-memory access token (D14). */
export const BEARER_PREFIX = 'Bearer ';

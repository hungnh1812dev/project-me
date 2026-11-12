/** Abort API requests that take longer than this. */
export const API_TIMEOUT_MS = 10_000;

/** Retries for the health query before it shows the error state. */
export const HEALTH_QUERY_RETRY = 1;

/** Expected `status` value of a healthy health endpoint (SPEC §6). */
export const HEALTH_STATUS_OK = 'ok';

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
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

export const ALLOW_HEADER = 'allow';
export const ACCEPT_HEADER = 'accept';
export const AUTHORIZATION_HEADER = 'authorization';
export const COOKIE_HEADER = 'cookie';
export const SET_COOKIE_HEADER = 'set-cookie';
export const CACHE_CONTROL_HEADER = 'cache-control';
export const CACHE_CONTROL_NO_STORE = 'no-store';
export const CONTENT_LENGTH_HEADER = 'content-length';
export const CONTENT_TYPE_HEADER = 'content-type';
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
export const ORIGIN_HEADER = 'origin';
export const SEC_FETCH_SITE_HEADER = 'sec-fetch-site';
export const SEC_FETCH_SITE_SAME_ORIGIN = 'same-origin';

/** Largest JSON body a BFF route reads (8 KiB). */
export const BFF_BODY_MAX_BYTES = 8192;

/** Fixed-window request limits per visitor IP and BFF bucket. */
export const BFF_RATE_LIMITS = {
  auth: { limit: 20, windowMs: 60 * MS_PER_SECOND },
  read: { limit: 120, windowMs: 60 * MS_PER_SECOND },
} as const;

/** Visitors the rate limiter remembers per bucket; the oldest are evicted first. */
export const RATE_LIMIT_MAX_KEYS = 10_000;

/** First status of a redirect; the server never follows one. */
export const REDIRECT_STATUS_MIN = 300;

/** Data cache lifetime of a server call that sets none (WEB-4). */
export const DEFAULT_REVALIDATE_SECONDS = 180;

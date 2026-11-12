import { API_ERROR_LOG_PREFIX } from '@/configs/Http.constants';

export const API_ERROR_SOURCES = {
  CMS_API_REST: 'cms-api-rest',
  CMS_API_GRAPHQL: 'cms-api-graphql',
  BFF: 'bff',
  TURNSTILE: 'turnstile',
  CLIENT: 'client',
} as const;

export type ApiErrorSource = (typeof API_ERROR_SOURCES)[keyof typeof API_ERROR_SOURCES];

/**
 * Every error code of the web app (WEB-10), grouped by the layer that raised it. Codes keep the
 * values the layers used before this list: no code is renamed. The BFF codes mirror
 * `BFF_ERROR_CODES` (a test keeps them equal); this file stays free of `server-only` so the
 * browser can import it.
 */
export const API_ERROR_CODES = {
  SERVER_API: {
    NETWORK: 'NETWORK',
    TIMEOUT: 'TIMEOUT',
    REDIRECT: 'REDIRECT',
    INVALID_BODY: 'INVALID_BODY',
  },
  GRAPHQL: {
    HTTP: 'HTTP_ERROR',
    NETWORK: 'NETWORK_ERROR',
    NO_DATA: 'NO_DATA',
    UNKNOWN: 'UNKNOWN_ERROR',
    UNAUTHENTICATED: 'UNAUTHENTICATED',
  },
  BFF: {
    INVALID_REQUEST: 'BFF_INVALID_REQUEST',
    HUMAN_CHECK_FAILED: 'BFF_HUMAN_CHECK_FAILED',
    INVALID_CREDENTIALS: 'BFF_INVALID_CREDENTIALS',
    INVALID_TWO_FACTOR_CODE: 'BFF_INVALID_TWO_FACTOR_CODE',
    TWO_FACTOR_EXPIRED: 'BFF_TWO_FACTOR_EXPIRED',
    SESSION_REQUIRED: 'BFF_SESSION_REQUIRED',
    ORIGIN_NOT_ALLOWED: 'BFF_ORIGIN_NOT_ALLOWED',
    PRIVILEGED_ACCOUNT: 'BFF_PRIVILEGED_ACCOUNT',
    METHOD_NOT_ALLOWED: 'BFF_METHOD_NOT_ALLOWED',
    BODY_TOO_LARGE: 'BFF_BODY_TOO_LARGE',
    UNSUPPORTED_MEDIA_TYPE: 'BFF_UNSUPPORTED_MEDIA_TYPE',
    RATE_LIMITED: 'BFF_RATE_LIMITED',
    UPSTREAM_FAILED: 'BFF_UPSTREAM_FAILED',
    HUMAN_CHECK_UNAVAILABLE: 'BFF_HUMAN_CHECK_UNAVAILABLE',
    UPSTREAM_TIMEOUT: 'BFF_UPSTREAM_TIMEOUT',
  },
  CLIENT: {
    NETWORK: 'CLIENT_NETWORK',
    RATE_LIMITED: 'CLIENT_RATE_LIMITED',
    HTTP: 'CLIENT_HTTP',
    UNEXPECTED: 'CLIENT_UNEXPECTED',
  },
} as const;

type CodeGroups = typeof API_ERROR_CODES;

export type ApiErrorCode = {
  [Group in keyof CodeGroups]: CodeGroups[Group][keyof CodeGroups[Group]];
}[keyof CodeGroups];

export interface WebApiErrorInit {
  source: ApiErrorSource;
  errorCode: ApiErrorCode;
  statusCode?: number | undefined;
  /** GraphQL operation name or BFF route. */
  operation?: string | undefined;
  retryable?: boolean;
  /** Seconds to wait after a rate limit. */
  retryAfterSeconds?: number | undefined;
  /** The `errorCode` cms-api answered with, when the failure carries one. */
  upstreamErrorCode?: string | undefined;
}

/**
 * The one failure type of every API layer, server and browser (WEB-10). It holds codes and numbers
 * only: never a token, cookie, request body or upstream text, so `message` is the code.
 */
export class WebApiError extends Error {
  readonly source: ApiErrorSource;
  readonly errorCode: ApiErrorCode;
  readonly statusCode: number | undefined;
  readonly operation: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly upstreamErrorCode: string | undefined;

  constructor(init: WebApiErrorInit) {
    super(init.errorCode);
    this.name = 'WebApiError';
    this.source = init.source;
    this.errorCode = init.errorCode;
    this.statusCode = init.statusCode;
    this.operation = init.operation;
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.upstreamErrorCode = init.upstreamErrorCode;
  }

  /** `source errorCode statusCode operation`, with `-` for a missing value. */
  toLogLine(): string {
    return [this.source, this.errorCode, this.statusCode ?? '-', this.operation ?? '-'].join(' ');
  }
}

/** The single hook a later error tracker plugs into. */
export function logApiError(error: WebApiError): void {
  console.warn(`${API_ERROR_LOG_PREFIX} ${error.toLogLine()}`);
}

import 'server-only';

import {
  ALLOW_HEADER,
  CACHE_CONTROL_HEADER,
  CACHE_CONTROL_NO_STORE,
  HTTP_STATUS,
  RETRY_AFTER_HEADER,
} from '../../../configs/Http.constants';

/** Every refusal of the BFF (ADR 0018 section 3): one row per code. */
export const BFF_ERROR_CODES = {
  BFF_INVALID_REQUEST: {
    statusCode: HTTP_STATUS.BAD_REQUEST,
    message: 'The request is not valid.',
  },
  BFF_HUMAN_CHECK_FAILED: {
    statusCode: HTTP_STATUS.BAD_REQUEST,
    message: 'The human check failed. Try again.',
  },
  BFF_INVALID_CREDENTIALS: {
    statusCode: HTTP_STATUS.UNAUTHORIZED,
    message: 'The email or password is not correct.',
  },
  BFF_INVALID_TWO_FACTOR_CODE: {
    statusCode: HTTP_STATUS.UNAUTHORIZED,
    message: 'The verification code is not correct.',
  },
  BFF_TWO_FACTOR_EXPIRED: {
    statusCode: HTTP_STATUS.UNAUTHORIZED,
    message: 'The verification step expired. Sign in again.',
  },
  BFF_SESSION_REQUIRED: {
    statusCode: HTTP_STATUS.UNAUTHORIZED,
    message: 'Sign in to continue.',
  },
  BFF_ORIGIN_NOT_ALLOWED: {
    statusCode: HTTP_STATUS.FORBIDDEN,
    message: 'The request origin is not allowed.',
  },
  BFF_PRIVILEGED_ACCOUNT: {
    statusCode: HTTP_STATUS.FORBIDDEN,
    message: 'This account cannot sign in on the public site.',
  },
  BFF_METHOD_NOT_ALLOWED: {
    statusCode: HTTP_STATUS.METHOD_NOT_ALLOWED,
    message: 'The method is not allowed.',
  },
  BFF_BODY_TOO_LARGE: {
    statusCode: HTTP_STATUS.PAYLOAD_TOO_LARGE,
    message: 'The request body is too large.',
  },
  BFF_UNSUPPORTED_MEDIA_TYPE: {
    statusCode: HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
    message: 'The request body must be JSON.',
  },
  BFF_RATE_LIMITED: {
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
    message: 'Too many requests. Try again later.',
  },
  BFF_UPSTREAM_FAILED: {
    statusCode: HTTP_STATUS.BAD_GATEWAY,
    message: 'The service could not complete the request.',
  },
  BFF_HUMAN_CHECK_UNAVAILABLE: {
    statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
    message: 'The human check is unavailable. Try again later.',
  },
  BFF_UPSTREAM_TIMEOUT: {
    statusCode: HTTP_STATUS.GATEWAY_TIMEOUT,
    message: 'The service took too long to answer.',
  },
} as const;

export type BffErrorCode = keyof typeof BFF_ERROR_CODES;

/** A refusal with a fixed code and message; nothing from the upstream ever reaches it. */
export class BffError extends Error {
  readonly errorCode: BffErrorCode;
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;

  constructor(errorCode: BffErrorCode, headers: Record<string, string> = {}) {
    super(errorCode);
    this.name = 'BffError';
    this.errorCode = errorCode;
    this.statusCode = BFF_ERROR_CODES[errorCode].statusCode;
    this.headers = headers;
  }

  static methodNotAllowed(allowedMethods: readonly string[]): BffError {
    return new BffError('BFF_METHOD_NOT_ALLOWED', { [ALLOW_HEADER]: allowedMethods.join(', ') });
  }

  static rateLimited(retryAfterSeconds: number): BffError {
    return new BffError('BFF_RATE_LIMITED', { [RETRY_AFTER_HEADER]: String(retryAfterSeconds) });
  }
}

/** The `{ statusCode, errorCode, message }` answer for a refusal. */
export function bffErrorResponse(error: BffError): Response {
  const { statusCode, message } = BFF_ERROR_CODES[error.errorCode];
  return Response.json(
    { statusCode, errorCode: error.errorCode, message },
    {
      status: statusCode,
      headers: { ...error.headers, [CACHE_CONTROL_HEADER]: CACHE_CONTROL_NO_STORE },
    },
  );
}

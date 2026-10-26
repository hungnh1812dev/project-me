import { HttpException, HttpStatus } from '@nestjs/common';

import {
  ERROR_CODES,
  type ErrorCode,
  INTERNAL_ERROR_MESSAGE,
} from '../constants/error.constants';
import {
  RETRY_AFTER_MAX_SECONDS,
  RETRY_AFTER_MIN_SECONDS,
} from '../constants/limits.constants';
import {
  DOMAIN_ERROR_KINDS,
  DomainError,
  type DomainErrorKind,
} from '../errors/Domain.errors';

/** The one table from a domain error kind to its HTTP status. */
export const DOMAIN_ERROR_HTTP_STATUS: Readonly<
  Record<DomainErrorKind, number>
> = {
  [DOMAIN_ERROR_KINDS.INVALID_INPUT]: HttpStatus.BAD_REQUEST,
  [DOMAIN_ERROR_KINDS.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [DOMAIN_ERROR_KINDS.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [DOMAIN_ERROR_KINDS.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DOMAIN_ERROR_KINDS.CONFLICT]: HttpStatus.CONFLICT,
  [DOMAIN_ERROR_KINDS.TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE]:
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  [DOMAIN_ERROR_KINDS.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [DOMAIN_ERROR_KINDS.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

/** What Nest's own exception for the status says when no message is given. */
export const DOMAIN_ERROR_DEFAULT_MESSAGE: Readonly<
  Record<DomainErrorKind, string>
> = {
  [DOMAIN_ERROR_KINDS.INVALID_INPUT]: 'Bad Request',
  [DOMAIN_ERROR_KINDS.UNAUTHENTICATED]: 'Unauthorized',
  [DOMAIN_ERROR_KINDS.FORBIDDEN]: 'Forbidden',
  [DOMAIN_ERROR_KINDS.NOT_FOUND]: 'Not Found',
  [DOMAIN_ERROR_KINDS.CONFLICT]: 'Conflict',
  [DOMAIN_ERROR_KINDS.TOO_LARGE]: 'Payload Too Large',
  [DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
  [DOMAIN_ERROR_KINDS.RATE_LIMITED]: 'Too Many Requests',
  [DOMAIN_ERROR_KINDS.UNAVAILABLE]: 'Service Unavailable',
};

/** Default `errorCode` for an HTTP status when the exception names none. */
export const ERROR_CODE_BY_STATUS: Readonly<
  Partial<Record<number, ErrorCode>>
> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ERROR_CODES.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODES.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.UNPROCESSABLE_ENTITY,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODES.SERVICE_UNAVAILABLE,
};

export interface HttpExceptionDescription {
  statusCode: number;
  errorCode: string;
  /** Generic for a server error: internals never reach a client. */
  message: string;
  /** Client errors only; a server error never exposes any. */
  details?: unknown;
  isServerError: boolean;
  /** Whole seconds, at least 1; only a rate-limited `DomainError` sets it. */
  retryAfterSeconds?: number;
}

interface ExceptionResponseObject {
  errorCode?: unknown;
  message?: unknown;
  details?: unknown;
}

const SERVER_ERROR_MIN_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

export function isServerErrorStatus(status: number): boolean {
  return status >= SERVER_ERROR_MIN_STATUS;
}

function isObject(value: unknown): value is ExceptionResponseObject {
  return typeof value === 'object' && value !== null;
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (isObject(response)) {
    if (typeof response.message === 'string') return response.message;
    if (Array.isArray(response.message)) {
      return response.message.filter((m) => typeof m === 'string').join('; ');
    }
  }
  return exception.message;
}

function errorCodeOf(exception: HttpException, status: number): string {
  const response = exception.getResponse();
  if (isObject(response) && typeof response.errorCode === 'string') {
    return response.errorCode;
  }
  const fallback: ErrorCode = isServerErrorStatus(status)
    ? ERROR_CODES.INTERNAL_ERROR
    : ERROR_CODES.HTTP_ERROR;
  return ERROR_CODE_BY_STATUS[status] ?? fallback;
}

/**
 * The status, `errorCode`, message and details a client sees for a Nest
 * exception. The one place REST (exception filter) and GraphQL (error
 * formatter) read an exception, so both answer the same way.
 */
export function describeHttpException(
  exception: HttpException,
): HttpExceptionDescription {
  const statusCode = exception.getStatus();
  const isServerError = isServerErrorStatus(statusCode);
  const response = exception.getResponse();
  const description: HttpExceptionDescription = {
    statusCode,
    errorCode: errorCodeOf(exception, statusCode),
    message: isServerError ? INTERNAL_ERROR_MESSAGE : messageOf(exception),
    isServerError,
  };
  if (!isServerError && isObject(response) && response.details !== undefined) {
    description.details = response.details;
  }
  return description;
}

/** NaN falls back to the minimum; Infinity and huge values to the maximum. */
function clampRetryAfterSeconds(seconds: number): number {
  if (Number.isNaN(seconds)) return RETRY_AFTER_MIN_SECONDS;
  return Math.min(
    RETRY_AFTER_MAX_SECONDS,
    Math.max(RETRY_AFTER_MIN_SECONDS, Math.ceil(seconds)),
  );
}

function describeDomainError(error: DomainError): HttpExceptionDescription {
  const statusCode = DOMAIN_ERROR_HTTP_STATUS[error.kind];
  const isServerError = isServerErrorStatus(statusCode);
  const fallbackCode: ErrorCode = isServerError
    ? ERROR_CODES.INTERNAL_ERROR
    : ERROR_CODES.HTTP_ERROR;
  const description: HttpExceptionDescription = {
    statusCode,
    errorCode:
      error.errorCode ?? ERROR_CODE_BY_STATUS[statusCode] ?? fallbackCode,
    message: isServerError
      ? INTERNAL_ERROR_MESSAGE
      : error.hasMessage
        ? error.message
        : DOMAIN_ERROR_DEFAULT_MESSAGE[error.kind],
    isServerError,
  };
  if (!isServerError && error.details !== undefined) {
    description.details = error.details;
  }
  if (
    error.kind === DOMAIN_ERROR_KINDS.RATE_LIMITED &&
    error.retryAfterSeconds !== undefined
  ) {
    description.retryAfterSeconds = clampRetryAfterSeconds(
      error.retryAfterSeconds,
    );
  }
  return description;
}

const UNKNOWN_ERROR_DESCRIPTION: HttpExceptionDescription = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  errorCode: ERROR_CODES.INTERNAL_ERROR,
  message: INTERNAL_ERROR_MESSAGE,
  isServerError: true,
};

/** An error the transport can describe by itself; anything else is a bug. */
export function isDescribableError(
  error: unknown,
): error is HttpException | DomainError {
  return error instanceof HttpException || error instanceof DomainError;
}

/**
 * The one reader of a thrown value for REST, GraphQL and bulk results: a Nest
 * exception, a `DomainError`, or anything else as a generic 500 (its detail
 * goes to the log by the caller, never to the client).
 */
export function describeError(error: unknown): HttpExceptionDescription {
  if (error instanceof HttpException) return describeHttpException(error);
  if (error instanceof DomainError) return describeDomainError(error);
  return { ...UNKNOWN_ERROR_DESCRIPTION };
}

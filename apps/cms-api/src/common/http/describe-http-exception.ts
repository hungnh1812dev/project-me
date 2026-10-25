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
import { DomainError } from '../errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../errors/DomainErrorKinds.constants';
import {
  DOMAIN_ERROR_DEFAULT_MESSAGE,
  DOMAIN_ERROR_HTTP_STATUS,
} from './DomainErrorHttpStatus.constants';
import { ERROR_CODE_BY_STATUS } from './ErrorCodeByStatus.constants';

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

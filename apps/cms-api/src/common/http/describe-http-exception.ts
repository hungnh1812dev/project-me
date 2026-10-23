import { HttpException, HttpStatus } from '@nestjs/common';

import {
  ERROR_CODE_BY_STATUS,
  ERROR_CODES,
  type ErrorCode,
  INTERNAL_ERROR_MESSAGE,
} from '../constants/error.constants';

export interface HttpExceptionDescription {
  statusCode: number;
  errorCode: string;
  /** Generic for a server error: internals never reach a client. */
  message: string;
  /** Client errors only; a server error never exposes any. */
  details?: unknown;
  isServerError: boolean;
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

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  ERROR_CODE_BY_STATUS,
  ERROR_CODES,
  type ErrorCode,
  INTERNAL_ERROR_MESSAGE,
} from '../constants/error.constants';
import type { RequestWithId } from '../middleware/request-id.middleware';

/** The one error shape every endpoint returns. */
export interface ErrorResponseBody {
  statusCode: number;
  errorCode: string;
  message: string;
  requestId: string | undefined;
}

interface ExceptionResponseObject {
  errorCode?: unknown;
  message?: unknown;
}

const SERVER_ERROR_MIN_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

function isServerError(status: number): boolean {
  return status >= SERVER_ERROR_MIN_STATUS;
}

function isObject(value: unknown): value is ExceptionResponseObject {
  return typeof value === 'object' && value !== null;
}

function messageFrom(exception: HttpException): string {
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

function errorCodeFrom(exception: HttpException, status: number): string {
  const response = exception.getResponse();
  if (isObject(response) && typeof response.errorCode === 'string') {
    return response.errorCode;
  }
  const fallback: ErrorCode = isServerError(status)
    ? ERROR_CODES.INTERNAL_ERROR
    : ERROR_CODES.HTTP_ERROR;
  return ERROR_CODE_BY_STATUS[status] ?? fallback;
}

/**
 * Turns every thrown value into `{ statusCode, errorCode, message, requestId }`.
 * Unknown errors become a generic 500; their details go to the log only.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();

    let body: ErrorResponseBody;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      body = {
        statusCode: status,
        errorCode: errorCodeFrom(exception, status),
        message: isServerError(status)
          ? INTERNAL_ERROR_MESSAGE
          : messageFrom(exception),
        requestId: req.requestId,
      };
    } else {
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ERROR_CODES.INTERNAL_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
        requestId: req.requestId,
      };
    }

    if (isServerError(body.statusCode)) {
      this.logger.error(
        `requestId=${body.requestId ?? 'none'} ${req.method} ${req.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(body.statusCode).json(body);
  }
}

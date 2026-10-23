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
  ERROR_CODES,
  INTERNAL_ERROR_MESSAGE,
} from '../constants/error.constants';
import {
  describeHttpException,
  isServerErrorStatus,
} from '../http/describe-http-exception';
import type { RequestWithId } from '../middleware/request-id.middleware';

/** The one error shape every endpoint returns. */
export interface ErrorResponseBody {
  statusCode: number;
  errorCode: string;
  message: string;
  /** Machine-readable context of a client error (SPEC §9), e.g. validation issues. */
  details?: unknown;
  requestId: string | undefined;
}

/**
 * Turns every thrown value into `{ statusCode, errorCode, message, details?, requestId }`.
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
      const described = describeHttpException(exception);
      body = {
        statusCode: described.statusCode,
        errorCode: described.errorCode,
        message: described.message,
        requestId: req.requestId,
      };
      if (described.details !== undefined) body.details = described.details;
    } else {
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ERROR_CODES.INTERNAL_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
        requestId: req.requestId,
      };
    }

    if (isServerErrorStatus(body.statusCode)) {
      this.logger.error(
        `requestId=${body.requestId ?? 'none'} ${req.method} ${req.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(body.statusCode).json(body);
  }
}

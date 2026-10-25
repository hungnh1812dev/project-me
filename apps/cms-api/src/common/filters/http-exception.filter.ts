import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { RETRY_AFTER_HEADER } from '../constants/limits.constants';
import {
  describeError,
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

    const described = describeError(exception);
    const body: ErrorResponseBody = {
      statusCode: described.statusCode,
      errorCode: described.errorCode,
      message: described.message,
      requestId: req.requestId,
    };
    if (described.details !== undefined) body.details = described.details;
    if (described.retryAfterSeconds !== undefined) {
      res.setHeader(RETRY_AFTER_HEADER, String(described.retryAfterSeconds));
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

import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { RETRY_AFTER_HEADER } from '../constants/Limits.constants';
import { describeError, isServerErrorStatus } from '../http/DescribeHttpException.rules';
import { closeAfterAnswer } from '../middleware/ByteLimit.rules';
import type { RequestWithId } from '../middleware/RequestId.middleware';

const MULTIPART_CONTENT_TYPE = 'multipart/form-data';
const CONNECTION_HEADER = 'Connection';
const CONNECTION_CLOSE = 'close';

/**
 * A rejected upload (401/403) whose body is still arriving must not make the client
 * keep sending: a slow-drip body would otherwise hold the socket for the whole request timeout.
 */
function shouldCloseRejectedUpload(statusCode: number, req: Request): boolean {
  const isRejection =
    statusCode === Number(HttpStatus.UNAUTHORIZED) || statusCode === Number(HttpStatus.FORBIDDEN);
  const isMultipart = req.headers?.['content-type']?.startsWith(MULTIPART_CONTENT_TYPE) ?? false;
  return isRejection && isMultipart && req.complete === false;
}

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

    if (shouldCloseRejectedUpload(body.statusCode, req)) {
      res.setHeader(CONNECTION_HEADER, CONNECTION_CLOSE);
      closeAfterAnswer(req, res);
    }

    res.status(body.statusCode).json(body);
  }
}

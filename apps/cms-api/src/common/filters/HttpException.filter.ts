import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { NO_STORE_HEADER } from '../constants/Http.constants';
import { RETRY_AFTER_HEADER } from '../constants/Limits.constants';
import { describeError, isServerErrorStatus } from '../http/DescribeHttpException.rules';
import { discardBodyAfterAnswer } from '../middleware/ByteLimit.rules';
import type { RequestWithId } from '../middleware/RequestId.middleware';

const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

/**
 * An upload answered with an error (401/403 before the body is read, 413/415/400
 * while it is being read) leaves body bytes the app never consumed; they must be
 * discarded so the proxy's kept-alive connection ends this request cleanly.
 */
function hasUnreadUploadBody(req: Request): boolean {
  const isMultipart = req.headers?.['content-type']?.startsWith(MULTIPART_CONTENT_TYPE) ?? false;
  return isMultipart && req.readableEnded === false;
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
    // Guards and throttles reject before a handler's @Header applies, so every error answer sets it here.
    res.setHeader(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE);
    if (described.retryAfterSeconds !== undefined) {
      res.setHeader(RETRY_AFTER_HEADER, String(described.retryAfterSeconds));
    }

    if (isServerErrorStatus(body.statusCode)) {
      this.logger.error(
        `requestId=${body.requestId ?? 'none'} ${req.method} ${req.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (hasUnreadUploadBody(req)) {
      discardBodyAfterAnswer(req, res);
    }

    res.status(body.statusCode).json(body);
  }
}

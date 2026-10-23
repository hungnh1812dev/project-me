import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { API_PREFIX } from '../../common/constants/api.constants';
import { DOCUMENTS_ROUTES } from './documents.routes';
import { ERROR_CODES } from '../../common/constants/error.constants';
import {
  closeAfterAnswer,
  createByteCounter,
  declaresBodyOver,
} from '../../common/middleware/byte-limit';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { BULK_LIMITS, BULK_MESSAGES } from './documents.constants';

/** Where `app.setup.ts` mounts the limit: before Nest's JSON parser, so never via `configure(consumer)`. */
export const BULK_BODY_LIMIT_MOUNT_PATH = `/${API_PREFIX}/${DOCUMENTS_ROUTES.ROOT}/${DOCUMENTS_ROUTES.BULK_PREFIX}`;

function reject(
  req: RequestWithId,
  res: Response,
  status: HttpStatus,
  errorCode: string,
  message: string,
): void {
  if (res.headersSent) return;
  res.status(status).setHeader('Connection', 'close').json({
    statusCode: status,
    errorCode,
    message,
    requestId: req.requestId,
  });
  closeAfterAnswer(req, res);
}

/**
 * Reads the JSON body of `POST /documents/:slug/bulk/*` up to
 * `BULK_LIMITS.MAX_BODY_BYTES` (1 MB, SPEC §6), ahead of Nest's global parser
 * (100 KB). Once the stream is consumed that parser skips the request. A
 * declared `Content-Length` over the limit is refused without reading; a
 * chunked body is counted as it arrives. Mount it on the bulk prefix.
 */
export function bulkBodyLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const request = req as RequestWithId & Request;
  if (req.method !== 'POST' || !req.is('json')) {
    next();
    return;
  }
  const tooLarge = (): void =>
    reject(
      request,
      res,
      HttpStatus.PAYLOAD_TOO_LARGE,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      BULK_MESSAGES.BODY_TOO_LARGE,
    );
  if (declaresBodyOver(req, BULK_LIMITS.MAX_BODY_BYTES)) {
    tooLarge();
    return;
  }
  const chunks: Buffer[] = [];
  const exceedsLimit = createByteCounter(BULK_LIMITS.MAX_BODY_BYTES);
  let aborted = false;
  req.on('data', (chunk: Buffer) => {
    if (aborted) return;
    if (exceedsLimit(chunk)) {
      aborted = true;
      chunks.length = 0;
      tooLarge();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      reject(
        request,
        res,
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.BAD_REQUEST,
        BULK_MESSAGES.INVALID_JSON,
      );
      return;
    }
    next();
  });
  req.on('error', () => {
    if (!aborted) next();
  });
}

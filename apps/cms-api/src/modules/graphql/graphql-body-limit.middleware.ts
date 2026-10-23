import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { ERROR_CODES } from '../../common/constants/error.constants';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import { GRAPHQL_LIMIT_MESSAGES, GRAPHQL_LIMITS } from './graphql.constants';

/** Events a body parser waits on to finish or abort a request body. */
const STREAM_EVENTS = ['data', 'end', 'close', 'aborted'] as const;

/** 413 in the GraphQL error shape (docs/modules/graphql.md "Errors"). */
function tooLarge(req: RequestWithId, res: Response): void {
  if (res.headersSent) return;
  res
    .status(HttpStatus.PAYLOAD_TOO_LARGE)
    .setHeader(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
    .setHeader('Connection', 'close')
    .json({
      errors: [
        {
          message: GRAPHQL_LIMIT_MESSAGES.BODY_TOO_LARGE,
          extensions: {
            code: ERROR_CODES.PAYLOAD_TOO_LARGE,
            ...(req.requestId === undefined
              ? {}
              : { requestId: req.requestId }),
          },
        },
      ],
    });
  // The parser behind us must never finish and call next(): drop its stream
  // listeners (ours is already past), stop reading, and close the socket once
  // the answer is out.
  for (const event of STREAM_EVENTS) req.removeAllListeners(event);
  req.pause();
  res.once('finish', () => req.destroy());
}

/**
 * Caps the `POST /graphql` body at `MAX_BODY_BYTES` (32 KiB), before the
 * global JSON parser (100 KB) reads it. A declared `Content-Length` over the
 * limit is refused without reading anything; a chunked body is counted as it
 * arrives. Mount it on the GraphQL path before Nest's own parser.
 */
export function graphqlBodyLimit(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'POST') {
    next();
    return;
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > GRAPHQL_LIMITS.MAX_BODY_BYTES) {
    tooLarge(req, res);
    return;
  }
  let received = 0;
  req.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > GRAPHQL_LIMITS.MAX_BODY_BYTES) tooLarge(req, res);
  });
  next();
}

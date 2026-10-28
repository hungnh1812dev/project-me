import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
} from '../constants/Http.constants';

/** Request after `requestIdMiddleware` has run. */
export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Gives every request a correlation id. A well-formed inbound
 * `X-Request-Id` (e.g. from Traefik) is kept; anything else is replaced.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.get(REQUEST_ID_HEADER);
  const requestId =
    inbound !== undefined && REQUEST_ID_PATTERN.test(inbound)
      ? inbound
      : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

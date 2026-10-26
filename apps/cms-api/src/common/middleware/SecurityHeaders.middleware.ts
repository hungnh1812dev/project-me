import type { NextFunction, Request, Response } from 'express';

import { API_SECURITY_RESPONSE_HEADERS } from '../constants/Http.constants';

/** Sets the API security headers (D17) on every response, errors included. */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  for (const [name, value] of Object.entries(API_SECURITY_RESPONSE_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}

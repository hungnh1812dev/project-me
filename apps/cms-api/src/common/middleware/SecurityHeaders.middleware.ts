import type { NextFunction, Request, Response } from 'express';

import {
  API_CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_HEADER,
} from '../constants/Http.constants';

/** Sets the API CSP (`default-src 'none'`) on every response, errors included. */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader(CONTENT_SECURITY_POLICY_HEADER, API_CONTENT_SECURITY_POLICY);
  next();
}

import type { Request } from 'express';

import { ClientIpResolver } from '../client-ip.resolver';
import { USER_AGENT_HEADER } from '../constants/auth.constants';
import { UNKNOWN_CLIENT_IP } from '../constants/limits.constants';

/** Where a refresh token was issued from (stored for session listings). */
export interface ClientMeta {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}

/** User agent and client IP stored with a new refresh token. */
export function clientMetaOf(
  clientIp: ClientIpResolver,
  req: Request,
): ClientMeta {
  const ip = clientIp.resolve(req);
  return {
    userAgent: req.get(USER_AGENT_HEADER),
    ip: ip === UNKNOWN_CLIENT_IP ? undefined : ip,
  };
}

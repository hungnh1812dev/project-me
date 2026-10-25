import type { Request } from 'express';

import { ClientIpResolver } from './client-ip.resolver';
import { USER_AGENT_HEADER } from '../constants/http.constants';
import { UNKNOWN_CLIENT_IP } from '../constants/limits.constants';
import type { ClientMeta } from '../types/ClientMeta.entity';

export type { ClientMeta };

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

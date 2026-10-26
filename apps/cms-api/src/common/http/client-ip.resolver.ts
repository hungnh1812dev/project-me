import { isIP } from 'node:net';

import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { USER_AGENT_HEADER } from '../constants/http.constants';
import { UNKNOWN_CLIENT_IP } from '../constants/limits.constants';
import type { ClientMeta } from '../types/ClientMeta.entity';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';

/** Prefix Node puts on IPv4 peers of a dual-stack socket. */
const IPV4_MAPPED_PREFIX = '::ffff:';

function normalize(ip: string): string {
  const lower = ip.trim().toLowerCase();
  const unmapped = lower.startsWith(IPV4_MAPPED_PREFIX)
    ? lower.slice(IPV4_MAPPED_PREFIX.length)
    : lower;
  return isIP(unmapped) === 0 ? lower : unmapped;
}

/**
 * The one source of truth for the client IP (D7), used for rate limits and
 * stored with refresh tokens.
 *
 * - `CLIENT_IP_HEADER` set (e.g. `cf-connecting-ip` behind Cloudflare): that
 *   header, if it holds exactly one valid IP. Only safe when the origin is
 *   reachable through that proxy alone, which then overwrites the header.
 * - Otherwise, or when the header is missing/invalid: Express `req.ip`, which
 *   honours `X-Forwarded-For` for exactly `TRUST_PROXY_HOPS` hops (app.setup.ts).
 *   Entries a client prepends beyond those hops are ignored (SPEC §12-8).
 */
@Injectable()
export class ClientIpResolver {
  private readonly header: string | undefined;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.header = config.http.clientIpHeader;
  }

  resolve(req: Request): string {
    if (this.header !== undefined) {
      const value = req.get(this.header);
      if (value !== undefined && isIP(value.trim()) !== 0) {
        return normalize(value);
      }
    }
    const ip = req.ip;
    return ip === undefined || ip === '' ? UNKNOWN_CLIENT_IP : normalize(ip);
  }
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

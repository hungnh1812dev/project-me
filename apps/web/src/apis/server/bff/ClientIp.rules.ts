import { isIP } from 'node:net';

import { FORWARDED_FOR_HEADER } from '../../../configs/Http.constants';

export interface VisitorIpConfig {
  /** Proxies in front of the server: how many addresses to skip from the right of `X-Forwarded-For`. */
  trustProxyHops: number;
  /** Header a trusted CDN sets to the visitor IP; wins over `X-Forwarded-For`. */
  clientIpHeader?: string | undefined;
}

function validIpOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && isIP(trimmed) !== 0 ? trimmed : undefined;
}

/**
 * The visitor IP (D7): `clientIpHeader` when it carries an address, else the `trustProxyHops`-th
 * address from the right of `X-Forwarded-For` (the left side is client-chosen).
 * Undefined when no trusted, valid address exists.
 */
export function visitorIpOf(headers: Headers, config: VisitorIpConfig): string | undefined {
  if (config.clientIpHeader !== undefined) {
    const fromClientIpHeader = validIpOrUndefined(headers.get(config.clientIpHeader));
    if (fromClientIpHeader !== undefined) return fromClientIpHeader;
  }
  if (config.trustProxyHops < 1) return undefined;
  const hops = (headers.get(FORWARDED_FOR_HEADER) ?? '').split(',');
  return validIpOrUndefined(hops[hops.length - config.trustProxyHops]);
}

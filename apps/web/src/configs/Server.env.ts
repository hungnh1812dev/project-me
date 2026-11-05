import 'server-only';

import { optionalText, requireEnv } from './RequireEnv.rules';
import { stripTrailingSlashes } from './StripTrailingSlashes.rules';

/** Shortest WEB_SESSION_SECRET accepted in production (256 bits). */
export const SESSION_SECRET_MIN_BYTES = 32;

/** Proxies in front of the web server when TRUST_PROXY_HOPS is unset (D7). */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/** Used when WEB_REVALIDATE_SECONDS is unset (SPEC: 60 s in production). */
export const DEFAULT_REVALIDATE_SECONDS = 60;

export interface ServerEnv {
  /** cms-api base URL reachable from the Next server (never sent to the browser). */
  apiInternalUrl: string;
  /** Data cache lifetime for server fetches; 0 disables caching. */
  revalidateSeconds: number;
  /** Whether `/status` shows the API health card; off answers 404 (ADR 0014). */
  isStatusPageEnabled: boolean;
  /** Exact origin of this site; the only `Origin` a state-changing BFF route accepts. */
  webOrigin: string;
  /** Key material for the sealed session cookies. */
  sessionSecret: string;
  /** Cloudflare Turnstile secret key; the BFF verifies every human check with it. */
  turnstileSecretKey: string;
  /** When set, a Turnstile answer must carry this hostname. */
  turnstileExpectedHostname: string | undefined;
  /** Proxy hops to skip from the right of `X-Forwarded-For` to reach the visitor (D7). */
  trustProxyHops: number;
  /** Header a trusted CDN sets to the visitor IP (e.g. `CF-Connecting-IP`); wins over `X-Forwarded-For`. */
  clientIpHeader: string | undefined;
}

const BOOLEAN_ENV_VALUES = { true: true, false: false } as const;

type EnvSource = Record<string, string | undefined>;

/** A deploy switch: exactly `true` or `false`; unset or blank means off. */
function parseSwitch(key: string, raw: string | undefined): boolean {
  const value = raw?.trim() ?? '';
  if (value === '') return false;
  if (value in BOOLEAN_ENV_VALUES) {
    return BOOLEAN_ENV_VALUES[value as keyof typeof BOOLEAN_ENV_VALUES];
  }
  throw new Error(`${key} must be true or false.`);
}

function parseWebOrigin(raw: string | undefined): string {
  const value = stripTrailingSlashes(requireEnv('WEB_ORIGIN', raw).trim());
  const isHttp = URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
  if (!isHttp || new URL(value).origin !== value) {
    throw new Error('WEB_ORIGIN must be an absolute http(s) origin without a path.');
  }
  return value;
}

function parseSessionSecret(raw: string | undefined, source: EnvSource): string {
  const secret = requireEnv('WEB_SESSION_SECRET', raw);
  if (source.NODE_ENV === 'production' && Buffer.byteLength(secret) < SESSION_SECRET_MIN_BYTES) {
    throw new Error(`WEB_SESSION_SECRET must be at least ${SESSION_SECRET_MIN_BYTES} bytes.`);
  }
  return secret;
}

function parseTrustProxyHops(raw: string | undefined): number {
  const text = optionalText(raw);
  if (text === undefined) return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(text);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  return hops;
}

/** Pure and testable; throws on any invalid value. */
export function parseServerEnv(source: EnvSource): ServerEnv {
  const apiInternalUrl = stripTrailingSlashes(
    requireEnv('API_INTERNAL_URL', source.API_INTERNAL_URL),
  );
  if (!URL.canParse(apiInternalUrl)) {
    throw new Error('API_INTERNAL_URL must be an absolute URL.');
  }

  const rawRevalidate = source.WEB_REVALIDATE_SECONDS?.trim();
  const revalidateSeconds =
    rawRevalidate === undefined || rawRevalidate === ''
      ? DEFAULT_REVALIDATE_SECONDS
      : Number(rawRevalidate);
  if (!Number.isInteger(revalidateSeconds) || revalidateSeconds < 0) {
    throw new Error('WEB_REVALIDATE_SECONDS must be a non-negative integer.');
  }

  return {
    apiInternalUrl,
    revalidateSeconds,
    isStatusPageEnabled: parseSwitch('WEB_STATUS_PAGE_ENABLED', source.WEB_STATUS_PAGE_ENABLED),
    webOrigin: parseWebOrigin(source.WEB_ORIGIN),
    sessionSecret: parseSessionSecret(source.WEB_SESSION_SECRET, source),
    turnstileSecretKey: requireEnv('TURNSTILE_SECRET_KEY', source.TURNSTILE_SECRET_KEY),
    turnstileExpectedHostname: optionalText(source.TURNSTILE_EXPECTED_HOSTNAME),
    trustProxyHops: parseTrustProxyHops(source.TRUST_PROXY_HOPS),
    clientIpHeader: optionalText(source.CLIENT_IP_HEADER),
  };
}

let cached: Readonly<ServerEnv> | undefined;

/** Read at runtime on the server; validated once (fails start via instrumentation). */
export function getServerEnv(): Readonly<ServerEnv> {
  cached ??= Object.freeze(parseServerEnv(process.env));
  return cached;
}

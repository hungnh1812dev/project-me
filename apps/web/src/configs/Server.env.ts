import 'server-only';

import { optionalText, requireEnv } from './RequireEnv.rules';
import { TURNSTILE } from './Security.constants';
import { stripTrailingSlashes } from './StripTrailingSlashes.rules';

/** Shortest WEB_SESSION_SECRET accepted in production (256 bits). */
export const SESSION_SECRET_MIN_BYTES = 32;

/** Proxies in front of the web server when TRUST_PROXY_HOPS is unset (D7). */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/** Used when WEB_REVALIDATE_SECONDS is unset (SPEC: 60 s in production). */
export const DEFAULT_REVALIDATE_SECONDS = 60;

/** The only value of ALLOW_TURNSTILE_TEST_SECRET: the smoke stack's production build may use the test secret. */
export const TURNSTILE_TEST_SECRET_OPT_IN = 'smoke';

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export interface ServerEnv {
  /** cms-api base URL reachable from the Next server (never sent to the browser). */
  apiInternalUrl: string;
  /** Data cache lifetime for server fetches; 0 disables caching. */
  revalidateSeconds: number;
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

type EnvSource = Record<string, string | undefined>;

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

function parseExpectedHostname(raw: string | undefined): string | undefined {
  const hostname = optionalText(raw)?.toLowerCase();
  if (hostname !== undefined && !HOSTNAME_PATTERN.test(hostname)) {
    throw new Error('TURNSTILE_EXPECTED_HOSTNAME must be a bare hostname, e.g. domain.com.');
  }
  return hostname;
}

/**
 * ADR 0018 section 2.6. Anything but unset, blank or `smoke` fails start; in
 * production the test secret needs the opt-in and a real secret needs a hostname.
 */
function assertTurnstileSafeForEnvironment(
  secretKey: string,
  expectedHostname: string | undefined,
  source: EnvSource,
): void {
  const optIn = optionalText(source.ALLOW_TURNSTILE_TEST_SECRET);
  if (optIn !== undefined && optIn !== TURNSTILE_TEST_SECRET_OPT_IN) {
    throw new Error(
      `ALLOW_TURNSTILE_TEST_SECRET must be unset or ${TURNSTILE_TEST_SECRET_OPT_IN}.`,
    );
  }
  if (source.NODE_ENV !== 'production') return;
  if (secretKey === TURNSTILE.ALWAYS_PASS_TEST_SECRET) {
    if (optIn !== TURNSTILE_TEST_SECRET_OPT_IN) {
      throw new Error(
        'TURNSTILE_SECRET_KEY is the Cloudflare test secret, not allowed in production.',
      );
    }
  } else if (expectedHostname === undefined) {
    throw new Error('TURNSTILE_EXPECTED_HOSTNAME is required in production.');
  }
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

  const turnstileSecretKey = requireEnv('TURNSTILE_SECRET_KEY', source.TURNSTILE_SECRET_KEY);
  const turnstileExpectedHostname = parseExpectedHostname(source.TURNSTILE_EXPECTED_HOSTNAME);
  assertTurnstileSafeForEnvironment(turnstileSecretKey, turnstileExpectedHostname, source);

  return {
    apiInternalUrl,
    revalidateSeconds,
    webOrigin: parseWebOrigin(source.WEB_ORIGIN),
    sessionSecret: parseSessionSecret(source.WEB_SESSION_SECRET, source),
    turnstileSecretKey,
    turnstileExpectedHostname,
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

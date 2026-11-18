import 'server-only';

import { assertAppEnvMatchesBuild, parseAppEnv, type AppEnv } from './AppEnv.rules';
import { BFF_RATE_LIMITS } from './Http.constants';
import { optionalText, requireEnv } from './RequireEnv.rules';
import { TURNSTILE } from './Security.constants';
import { stripTrailingSlashes } from './StripTrailingSlashes.rules';

/** Shortest WEB_SESSION_SECRET accepted in production (256 bits). */
export const SESSION_SECRET_MIN_BYTES = 32;

/** Proxies in front of the web server when TRUST_PROXY_HOPS is unset (D7). */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/** The only value of ALLOW_TURNSTILE_TEST_SECRET and ALLOW_BFF_RATE_LIMIT_OVERRIDE: the smoke stack's production build may use a test-only setting. */
export const SMOKE_STACK_OPT_IN = 'smoke';

/** Env key that raises a BFF bucket's limit per visitor IP; test stacks only (ADR 0018 section 2.7). */
export const BFF_RATE_LIMIT_OVERRIDE_ENV_KEYS = {
  auth: 'BFF_AUTH_RATE_LIMIT_IP',
} as const satisfies Partial<Record<keyof typeof BFF_RATE_LIMITS, string>>;

/** cms-api API token (D5): `ak_live_` + base64url. */
const API_TOKEN_PATTERN = /^ak_live_[A-Za-z0-9_-]+$/;

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export interface ServerEnv {
  /** cms-api base URL reachable from the Next server (never sent to the browser). */
  appApiUrl: string;
  /** cms-api API token for server content reads (WEB-2); server only, never logged. Required in production. */
  appApiToken: string | undefined;
  /** When set, replaces every server call's data cache lifetime; 0 disables caching. */
  revalidateOverrideSeconds: number | undefined;
  /** The stack this server runs on, equal to the value it was built with (WEB-9). */
  appEnv: AppEnv;
  /** Whether a failed content read may fall back to the mock data: only where APP_ENV is not production (WEB-5). */
  isMockFallbackOn: boolean;
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
  /** Test stacks only: a bucket's limit per visitor IP in place of `BFF_RATE_LIMITS`. */
  bffRateLimitOverrides: Partial<Record<keyof typeof BFF_RATE_LIMITS, number>>;
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
  if (optIn !== undefined && optIn !== SMOKE_STACK_OPT_IN) {
    throw new Error(`ALLOW_TURNSTILE_TEST_SECRET must be unset or ${SMOKE_STACK_OPT_IN}.`);
  }
  if (source.NODE_ENV !== 'production') return;
  if (secretKey === TURNSTILE.ALWAYS_PASS_TEST_SECRET) {
    if (optIn !== SMOKE_STACK_OPT_IN) {
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

/**
 * ADR 0018 section 2.7. The opt-in is unset, blank or `smoke` everywhere; each
 * override is an integer >= 1, and production refuses one without the opt-in.
 */
function parseBffRateLimitOverrides(
  source: EnvSource,
): Partial<Record<keyof typeof BFF_RATE_LIMITS, number>> {
  const optIn = optionalText(source.ALLOW_BFF_RATE_LIMIT_OVERRIDE);
  if (optIn !== undefined && optIn !== SMOKE_STACK_OPT_IN) {
    throw new Error(`ALLOW_BFF_RATE_LIMIT_OVERRIDE must be unset or ${SMOKE_STACK_OPT_IN}.`);
  }
  const overrides: Partial<Record<keyof typeof BFF_RATE_LIMITS, number>> = {};
  for (const [bucket, envKey] of Object.entries(BFF_RATE_LIMIT_OVERRIDE_ENV_KEYS) as [
    keyof typeof BFF_RATE_LIMITS,
    string,
  ][]) {
    const text = optionalText(source[envKey]);
    if (text === undefined) continue;
    const limit = Number(text);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`${envKey} must be an integer >= 1.`);
    }
    if (source.NODE_ENV === 'production' && optIn !== SMOKE_STACK_OPT_IN) {
      throw new Error(
        `${envKey} is not allowed in production without ALLOW_BFF_RATE_LIMIT_OVERRIDE.`,
      );
    }
    overrides[bucket] = limit;
  }
  return overrides;
}

function parseAppApiUrl(raw: string | undefined): string {
  const value = stripTrailingSlashes(requireEnv('APP_API_URL', raw).trim());
  if (!URL.canParse(value)) {
    throw new Error('APP_API_URL must be an absolute URL.');
  }
  return value;
}

/** The message names the key and never the value. */
function parseAppApiToken(raw: string | undefined, source: EnvSource): string | undefined {
  const token = optionalText(raw);
  if (token === undefined) {
    if (source.NODE_ENV === 'production') {
      throw new Error('APP_API_TOKEN is required in production. See .env.example.');
    }
    return undefined;
  }
  if (!API_TOKEN_PATTERN.test(token)) {
    throw new Error('APP_API_TOKEN must be an API token (ak_live_ followed by base64url).');
  }
  return token;
}

function parseRevalidateOverride(raw: string | undefined): number | undefined {
  const text = optionalText(raw);
  if (text === undefined) return undefined;
  const seconds = Number(text);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error('WEB_REVALIDATE_SECONDS must be a non-negative integer.');
  }
  return seconds;
}

/**
 * Pure and testable; throws on any invalid value. `buildAppEnv` is the value
 * `next.config.ts` inlined at build; it is a parameter because only the literal
 * `process.env.APP_ENV_BUILD` is replaced at build, never a lookup on `source`.
 */
export function parseServerEnv(source: EnvSource, buildAppEnv: string | undefined): ServerEnv {
  const appEnv = parseAppEnv(source.APP_ENV);
  assertAppEnvMatchesBuild(appEnv, buildAppEnv);
  const turnstileSecretKey = requireEnv('TURNSTILE_SECRET_KEY', source.TURNSTILE_SECRET_KEY);
  const turnstileExpectedHostname = parseExpectedHostname(source.TURNSTILE_EXPECTED_HOSTNAME);
  assertTurnstileSafeForEnvironment(turnstileSecretKey, turnstileExpectedHostname, source);

  return {
    appApiUrl: parseAppApiUrl(source.APP_API_URL),
    appApiToken: parseAppApiToken(source.APP_API_TOKEN, source),
    revalidateOverrideSeconds: parseRevalidateOverride(source.WEB_REVALIDATE_SECONDS),
    appEnv,
    isMockFallbackOn: appEnv !== 'production',
    webOrigin: parseWebOrigin(source.WEB_ORIGIN),
    sessionSecret: parseSessionSecret(source.WEB_SESSION_SECRET, source),
    turnstileSecretKey,
    turnstileExpectedHostname,
    trustProxyHops: parseTrustProxyHops(source.TRUST_PROXY_HOPS),
    clientIpHeader: optionalText(source.CLIENT_IP_HEADER),
    bffRateLimitOverrides: parseBffRateLimitOverrides(source),
  };
}

let cached: Readonly<ServerEnv> | undefined;

/** Read at runtime on the server; validated once (fails start via instrumentation). */
export function getServerEnv(): Readonly<ServerEnv> {
  cached ??= Object.freeze(parseServerEnv(process.env, process.env.APP_ENV_BUILD));
  return cached;
}

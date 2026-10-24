import type { RateLimitOverrideEnvKey } from '../../config/config.constants';
import { MS_PER_HOUR, MS_PER_MINUTE } from './time.constants';

/** Window lengths shared by the modules' rate-limit policies. */
export const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE;
export const ONE_MINUTE_MS = MS_PER_MINUTE;
export const ONE_HOUR_MS = MS_PER_HOUR;
export const TEN_MINUTES_MS = 10 * MS_PER_MINUTE;

/** What a throttle rule counts per window. */
export const RATE_LIMIT_KEY_SOURCES = {
  /** The resolved client IP (`ClientIpResolver`, D7). */
  IP: 'ip',
  /** `body.email`, trimmed and lower-cased, hashed. Never checked against the DB. */
  EMAIL: 'email',
  /**
   * The signed-in caller (`req.user.actor.accountId`). Only for routes behind
   * `JwtAuthGuard`: the throttle guard must run after it (method-level
   * `@Throttle` does). No signed-in account means the rule is skipped.
   */
  ACTOR: 'actor',
  /**
   * The resolved client IP, counted only for anonymous requests (T20): a
   * signed-in caller is skipped. Needs the authentication guard to run first.
   */
  ANONYMOUS_IP: 'anonymous-ip',
} as const;

export type RateLimitKeySource =
  (typeof RATE_LIMIT_KEY_SOURCES)[keyof typeof RATE_LIMIT_KEY_SOURCES];

export interface RateLimitRule {
  /** Prefix of the counter key; unique per rule so counters never mix. */
  readonly name: string;
  readonly keySource: RateLimitKeySource;
  /** Requests allowed per window; the next one gets 429. */
  readonly limit: number;
  readonly windowMs: number;
  /**
   * Env key that may replace `limit` (T18b, T18c). Only the keys listed in
   * `RATE_LIMIT_OVERRIDE_ENV_KEYS` are accepted; the config parses and guards
   * them, the guard applies them.
   */
  readonly limitOverrideEnvKey?: RateLimitOverrideEnvKey;
}

/** The rules a route is throttled by, checked in order; the IP rule goes first. */
export type RateLimitPolicy = readonly RateLimitRule[];

/** Expired counters are swept at most this often. */
export const RATE_LIMIT_SWEEP_INTERVAL_MS = FIFTEEN_MINUTES_MS;

/**
 * T10a: most live counters the in-memory store holds, so an attacker rotating
 * IPs or emails can't grow it without bound. Measured ~200-250 bytes per key
 * (hashed email or IPv6 key), so ~12 MB at the cap: safe on a small VPS while
 * far above what a small CMS uses in one 15-minute window (one login from a
 * new IP and email takes 2 keys). At the cap, expired counters are swept; if
 * it is still full, new keys are refused (429, fail closed).
 */
export const RATE_LIMIT_MAX_KEYS = 50_000;

/** At most one "store full" warning per this interval while keys are refused. */
export const RATE_LIMIT_CAPACITY_WARN_INTERVAL_MS = ONE_MINUTE_MS;

/** `Retry-After` is whole seconds and at least this. */
export const RETRY_AFTER_MIN_SECONDS = 1;
export const RETRY_AFTER_HEADER = 'Retry-After';

/** Same message for every exhausted rule, so it reveals nothing about the key. */
export const RATE_LIMIT_MESSAGE = 'Too many requests, try again later';

/** Digest used for email keys: bounded size, no plain emails in memory. */
export const RATE_LIMIT_KEY_HASH_ALGORITHM = 'sha256';

/** Key used when the client IP can't be determined (socket already gone). */
export const UNKNOWN_CLIENT_IP = 'unknown';

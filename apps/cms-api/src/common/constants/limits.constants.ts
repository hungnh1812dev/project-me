export const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** Length of the auth throttling windows decided for T10. */
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE;
const ONE_MINUTE_MS = MS_PER_MINUTE;
const ONE_HOUR_MS = 60 * MS_PER_MINUTE;

/** What a throttle rule counts per window. */
export const RATE_LIMIT_KEY_SOURCES = {
  /** The resolved client IP (`ClientIpResolver`, D7). */
  IP: 'ip',
  /** `body.email`, trimmed and lower-cased, hashed. Never checked against the DB. */
  EMAIL: 'email',
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
}

/**
 * D7 / T10 user decision: fixed-window limits of the auth endpoints. The
 * rules of one policy are checked in order and the first exhausted rule
 * answers 429, so put the IP rule first.
 */
export const RATE_LIMIT_POLICIES = {
  LOGIN: [
    {
      name: 'login:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
    {
      name: 'login:email',
      keySource: RATE_LIMIT_KEY_SOURCES.EMAIL,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /auth/password/request-otp`. The email rule makes the 6th request
   * per email and hour a 429 whether the account exists or not (§12-9, no
   * enumeration); OtpService also caps codes per account in the DB.
   */
  OTP_REQUEST: [
    {
      name: 'otp-request:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
    {
      name: 'otp-request:email',
      keySource: RATE_LIMIT_KEY_SOURCES.EMAIL,
      limit: 5,
      windowMs: ONE_HOUR_MS,
    },
  ],
  /** `POST /auth/password/reset` and `/set` (T12). Each code also allows 5 checks. */
  PASSWORD_SUBMIT: [
    {
      name: 'password-submit:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** `POST /auth/password/change` (T12): bounds current-password guessing. */
  PASSWORD_CHANGE: [
    {
      name: 'password-change:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** Attached by T13 (`POST /auth/2fa/verify`). The 5 attempts per temp token are T13's. */
  TWO_FACTOR_VERIFY: [
    {
      name: '2fa-verify:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  REFRESH: [
    {
      name: 'refresh:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 30,
      windowMs: ONE_MINUTE_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

export type RateLimitPolicy =
  (typeof RATE_LIMIT_POLICIES)[keyof typeof RATE_LIMIT_POLICIES];

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

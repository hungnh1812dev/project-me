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
}

/** Names of the rules whose limit `loadAppConfig` can override (T18b, T18c). */
export const RATE_LIMIT_RULE_NAMES = {
  LOGIN_IP: 'login:ip',
  LOGIN_EMAIL: 'login:email',
  REFRESH_IP: 'refresh:ip',
} as const;

/**
 * D7 / T10 user decision: fixed-window limits of the auth endpoints. The
 * rules of one policy are checked in order and the first exhausted rule
 * answers 429, so put the IP rule first.
 */
export const RATE_LIMIT_POLICIES = {
  LOGIN: [
    {
      name: RATE_LIMIT_RULE_NAMES.LOGIN_IP,
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
    {
      name: RATE_LIMIT_RULE_NAMES.LOGIN_EMAIL,
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
  /** `POST /auth/2fa/verify`; each temp token also allows only 5 checks. */
  TWO_FACTOR_VERIFY: [
    {
      name: '2fa-verify:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /auth/2fa/email-challenge` and `/auth/2fa/email/send-code` (T13,
   * one shared counter); OtpService also caps codes per account in the DB.
   */
  TWO_FACTOR_EMAIL_CHALLENGE: [
    {
      name: '2fa-email:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /auth/2fa/totp/setup`, `/enable` and `/disable` (T13, one shared
   * counter): enable and disable test the current password.
   */
  TWO_FACTOR_MANAGE: [
    {
      name: '2fa-manage:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /accounts` and `POST /accounts/:id/invite/resend` (T17a, Q9): one
   * shared counter per caller and per IP, so invite and resend can't be used
   * to mail-bomb. In memory (one replica).
   */
  ACCOUNT_INVITE: [
    {
      name: 'account-invite:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 20,
      windowMs: ONE_HOUR_MS,
    },
    {
      name: 'account-invite:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      limit: 10,
      windowMs: ONE_HOUR_MS,
    },
  ],
  /**
   * Anonymous `GET /documents/...` (T20, user decision): 120 per minute per
   * IP. Signed-in accounts and API tokens are not counted. In memory.
   */
  DOCUMENT_READ_ANONYMOUS: [
    {
      name: 'document-read:anonymous-ip',
      keySource: RATE_LIMIT_KEY_SOURCES.ANONYMOUS_IP,
      limit: 120,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  /**
   * `POST /media` (T27): uploads re-encode images and call the storage
   * provider, so they are bounded per signed-in caller and per IP. In memory.
   */
  MEDIA_UPLOAD: [
    {
      name: 'media-upload:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 120,
      windowMs: ONE_HOUR_MS,
    },
    {
      name: 'media-upload:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      limit: 60,
      windowMs: ONE_HOUR_MS,
    },
  ],
  /**
   * `POST /setup/owner` (ADR 0005). The token has 256 bits, so this does not
   * stop guessing; it bounds audit noise and Argon2 work per IP.
   */
  SETUP_SUBMIT: [
    {
      name: 'setup-submit:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** `GET /setup/status` (ADR 0005): public, one small read. */
  SETUP_STATUS: [
    {
      name: 'setup-status:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 30,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  /** `GET /reviewer/status` (T31): public, one small read. In memory. */
  REVIEWER_STATUS: [
    {
      name: 'reviewer-status:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 120,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  /**
   * `POST /reviewer/sessions` (T31): bounds Turnstile calls and body parsing
   * per IP. The binding rule (1 session per IP per 10 min) lives in the DB.
   */
  REVIEWER_SESSION_ATTEMPTS: [
    {
      name: 'reviewer-session:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      limit: 20,
      windowMs: 10 * MS_PER_MINUTE,
    },
  ],
  REFRESH: [
    {
      name: RATE_LIMIT_RULE_NAMES.REFRESH_IP,
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

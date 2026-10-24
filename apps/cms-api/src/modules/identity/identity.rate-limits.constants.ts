import {
  FIFTEEN_MINUTES_MS,
  ONE_HOUR_MS,
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../common/constants/limits.constants';
import type { RateLimitOverrideEnvKey } from '../../config/config.constants';

/** Names of the rules whose limit an env key can override. */
export const RATE_LIMIT_RULE_NAMES = {
  LOGIN_IP: 'login:ip',
  LOGIN_EMAIL: 'login:email',
  REFRESH_IP: 'refresh:ip',
} as const;

/**
 * D7 user decision: fixed-window limits of the auth endpoints. The
 * rules of one policy are checked in order and the first exhausted rule
 * answers 429, so put the IP rule first.
 */
export const IDENTITY_RATE_LIMIT_POLICIES = {
  LOGIN: [
    {
      name: RATE_LIMIT_RULE_NAMES.LOGIN_IP,
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 10,
      windowMs: FIFTEEN_MINUTES_MS,
      limitOverrideEnvKey: 'LOGIN_RATE_LIMIT_IP',
    },
    {
      name: RATE_LIMIT_RULE_NAMES.LOGIN_EMAIL,
      keySource: RATE_LIMIT_KEY_SOURCES.EMAIL,
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
      limitOverrideEnvKey: 'LOGIN_RATE_LIMIT_EMAIL',
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
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
    {
      name: 'otp-request:email',
      keySource: RATE_LIMIT_KEY_SOURCES.EMAIL,
      maxHits: 5,
      windowMs: ONE_HOUR_MS,
    },
  ],
  /** `POST /auth/password/reset` and `/set`. Each code also allows 5 checks. */
  PASSWORD_SUBMIT: [
    {
      name: 'password-submit:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** `POST /auth/password/change`: bounds current-password guessing. */
  PASSWORD_CHANGE: [
    {
      name: 'password-change:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** `POST /auth/2fa/verify`; each temp token also allows only 5 checks. */
  TWO_FACTOR_VERIFY: [
    {
      name: '2fa-verify:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 10,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /auth/2fa/email-challenge` and `/auth/2fa/email/send-code` (one
   * shared counter); OtpService also caps codes per account in the DB.
   */
  TWO_FACTOR_EMAIL_CHALLENGE: [
    {
      name: '2fa-email:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /**
   * `POST /auth/2fa/totp/setup`, `/enable` and `/disable` (one shared
   * counter): enable and disable test the current password.
   */
  TWO_FACTOR_MANAGE: [
    {
      name: '2fa-manage:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
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
      maxHits: 5,
      windowMs: FIFTEEN_MINUTES_MS,
    },
  ],
  /** `GET /setup/status` (ADR 0005): public, one small read. */
  SETUP_STATUS: [
    {
      name: 'setup-status:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 30,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  REFRESH: [
    {
      name: RATE_LIMIT_RULE_NAMES.REFRESH_IP,
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 30,
      windowMs: ONE_MINUTE_MS,
      limitOverrideEnvKey: 'REFRESH_RATE_LIMIT_IP',
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/**
 * Env key -> rule name of every identity rule an env key can override. Pinned
 * by a spec; the production opt-in check iterates `RATE_LIMIT_OVERRIDE_ENV_KEYS`.
 */
export const rateLimitOverrideBindings: Readonly<
  Partial<Record<RateLimitOverrideEnvKey, string>>
> = Object.fromEntries(
  Object.values(IDENTITY_RATE_LIMIT_POLICIES)
    .flat()
    .flatMap((rule: RateLimitRule) =>
      rule.limitOverrideEnvKey === undefined
        ? []
        : [[rule.limitOverrideEnvKey, rule.name]],
    ),
);

import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  TEN_MINUTES_MS,
  type RateLimitRule,
} from '../../common/constants/limits.constants';

export const REVIEWER_RATE_LIMIT_POLICIES = {
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
      windowMs: TEN_MINUTES_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

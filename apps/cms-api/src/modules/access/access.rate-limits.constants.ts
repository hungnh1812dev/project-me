import {
  ONE_HOUR_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../common/constants/limits.constants';

export const ACCESS_RATE_LIMIT_POLICIES = {
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
} as const satisfies Record<string, readonly RateLimitRule[]>;

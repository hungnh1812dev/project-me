import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../common/constants/limits.constants';

export const DOCUMENTS_RATE_LIMIT_POLICIES = {
  /**
   * Anonymous `GET /documents/...` (user decision): 120 per minute per
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
} as const satisfies Record<string, readonly RateLimitRule[]>;

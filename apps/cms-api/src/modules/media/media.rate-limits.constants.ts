import {
  ONE_HOUR_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../common/constants/limits.constants';

export const MEDIA_RATE_LIMIT_POLICIES = {
  /**
   * `POST /media`: uploads re-encode images and call the storage
   * provider, so they are bounded per signed-in caller and per IP. In memory.
   */
  MEDIA_UPLOAD: [
    {
      name: 'media-upload:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 120,
      windowMs: ONE_HOUR_MS,
    },
    {
      name: 'media-upload:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 60,
      windowMs: ONE_HOUR_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

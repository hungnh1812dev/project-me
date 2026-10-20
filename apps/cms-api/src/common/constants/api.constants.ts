/** Global route prefix (SPEC §6). Express adds the leading slash. */
export const API_PREFIX = 'api/v1';

export const API_ROUTES = {
  HEALTH: {
    ROOT: 'health',
    LIVE: 'live',
    READY: 'ready',
  },
} as const;

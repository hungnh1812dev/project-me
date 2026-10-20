/**
 * The single map of cms-api paths (SPEC §5), relative to `appEnv.apiBaseUrl`.
 * No trailing slashes; the API client strips them anyway.
 */
export const API_ENDPOINTS = {
  HEALTH: {
    LIVE: '/health/live',
    READY: '/health/ready',
  },
} as const;

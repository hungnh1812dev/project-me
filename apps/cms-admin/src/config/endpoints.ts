/**
 * The single map of cms-api paths (SPEC §5, §9), relative to
 * `appEnv.apiBaseUrl`. No trailing slashes; the API client strips them anyway.
 */
export const API_ENDPOINTS = {
  HEALTH: {
    LIVE: '/health/live',
    READY: '/health/ready',
  },
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  PASSWORD: {
    REQUEST_OTP: '/auth/password/request-otp',
    RESET: '/auth/password/reset',
    SET: '/auth/password/set',
  },
} as const;

/** Global route prefix (SPEC §6). Express adds the leading slash. */
export const API_PREFIX = 'api/v1';

export const API_ROUTES = {
  HEALTH: {
    ROOT: 'health',
    LIVE: 'live',
    READY: 'ready',
  },
  AUTH: {
    ROOT: 'auth',
    LOGIN: 'login',
    REFRESH: 'refresh',
    LOGOUT: 'logout',
    ME: 'me',
  },
  /** SPEC §9 password lifecycle (T12), under /auth/password. */
  PASSWORD: {
    ROOT: 'auth/password',
    REQUEST_OTP: 'request-otp',
    RESET: 'reset',
    SET: 'set',
    CHANGE: 'change',
  },
} as const;

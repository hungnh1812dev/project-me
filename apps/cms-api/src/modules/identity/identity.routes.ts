export const AUTH_ROUTES = {
  ROOT: 'auth',
  LOGIN: 'login',
  REFRESH: 'refresh',
  LOGOUT: 'logout',
  ME: 'me',
} as const;

/** Owner setup (ADR 0005): public, open only while no owner exists. */
export const SETUP_ROUTES = {
  ROOT: 'setup',
  STATUS: 'status',
  OWNER: 'owner',
} as const;

/** SPEC §9 password lifecycle (T12), under /auth/password. */
export const PASSWORD_ROUTES = {
  ROOT: `${AUTH_ROUTES.ROOT}/password`,
  REQUEST_OTP: 'request-otp',
  RESET: 'reset',
  SET: 'set',
  CHANGE: 'change',
} as const;

/** SPEC §9 two-factor endpoints (T13), under /auth/2fa. */
export const TWO_FACTOR_ROUTES = {
  ROOT: `${AUTH_ROUTES.ROOT}/2fa`,
  TOTP_SETUP: 'totp/setup',
  ENABLE: 'enable',
  DISABLE: 'disable',
  VERIFY: 'verify',
  EMAIL_CHALLENGE: 'email-challenge',
  /** T13 Q9: emailed code for enable/disable of email 2FA (signed in). */
  EMAIL_SEND_CODE: 'email/send-code',
} as const;

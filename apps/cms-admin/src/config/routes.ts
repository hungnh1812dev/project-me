/** Client-side routes of the admin console. No trailing slashes. */
export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  /** Named in the reset email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  RESET_PASSWORD: '/reset-password',
  /** Named in the invitation email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  SET_PASSWORD: '/set-password',
  /** Two-factor and password settings of the signed-in account (T13). */
  SECURITY_SETTINGS: '/settings/security',
} as const;

/** Built-in words, in two groups: `LAST_RESORT_TEXT` shows when a part's own text cannot load (error and not-found pages, the header brand, `global-error`); `MOBILE_NAV_TEXT` names the nav drawer buttons. */
export const LAST_RESORT_TEXT = {
  appName: 'Abyss',
  signIn: 'Sign in',
  signOut: 'Sign out',
  errorTitle: 'Something went wrong',
  errorDescription:
    'This page could not be loaded. Nothing was changed. Try again, or come back in a few minutes.',
  errorRetry: 'Try again',
  notFoundTitle: 'Page not found',
  notFoundDescription: 'There is nothing at this address. Check the link and try again.',
  noCvLive: 'No CV is live yet.',
  statusChecking: 'Checking',
  statusOperational: 'Operational',
  statusUnreachable: 'Unreachable',
  statusCheckAgain: 'Check again',
} as const;

/** Names of the mobile nav drawer buttons: always used, never loaded from the CMS (WEB-3, PS-6). */
export const MOBILE_NAV_TEXT = {
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
} as const;

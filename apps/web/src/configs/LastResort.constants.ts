/** Shown when a part's own text cannot load (error and not-found pages, the header brand, `global-error`). */
export const LAST_RESORT_TEXT = {
  appName: 'Abyss',
  navCvLink: 'CV',
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

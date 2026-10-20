/** User-facing text. One place until an i18n module exists. */
export const COPY = {
  app: {
    name: 'Abyss CMS',
  },
  session: {
    restoring: 'Restoring your session',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
  },
  login: {
    title: 'Sign in',
    description: 'Use the email and password of your Abyss CMS account.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    validation: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'Enter an email like name@example.com.',
      passwordRequired: 'Enter your password.',
    },
    errors: {
      invalidCredentials:
        'The email or password is incorrect. Check both and try again.',
      rateLimitedSeconds: (seconds: number) =>
        `Too many sign-in attempts. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      rateLimitedMinutes: (minutes: number) =>
        `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      rateLimited:
        'Too many sign-in attempts. Wait a few minutes, then try again.',
      network:
        'Could not reach the server. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
    },
    twoFactor: {
      title: 'Two-step verification required',
      description:
        'Your password was accepted, but this account also needs a verification code. Entering the code is not available in the admin console yet (coming in T13).',
      back: 'Back to sign in',
    },
  },
  page: {
    title: 'System status',
    description:
      'The admin console is not ready yet. This page confirms it can reach the content API from the admin domain.',
  },
  status: {
    cardTitle: 'Content API',
    cardDescription:
      'Liveness check on the API the admin console manages content through.',
    endpointLabel: 'Endpoint',
    lastCheckedLabel: 'Last checked',
    notCheckedYet: 'Not checked yet',
    state: {
      checking: 'Checking',
      ok: 'Operational',
      error: 'Unreachable',
    },
    errorHint:
      'The API did not respond. Check that cms-api is running and reachable through the proxy, then check again.',
    checkAgain: 'Check again',
  },
} as const;

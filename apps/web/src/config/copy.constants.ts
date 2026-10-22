/** User-facing text. One place until an i18n module exists. */
export const COPY = {
  app: {
    name: 'Abyss',
  },
  page: {
    title: 'System status',
    description:
      'The public site is not live yet. This page confirms the site can reach the content API through the same domain.',
  },
  session: {
    signIn: 'Sign in',
    signOut: 'Sign out',
    openCms: 'Open CMS',
    signOutFailed:
      'Sign-out did not reach the server, so you are still signed in. Try again.',
    signedInAs: (name: string) => `Signed in as ${name}`,
  },
  login: {
    title: 'Sign in',
    description: 'Use the email and password of your Abyss account.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    cancel: 'Cancel',
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
      privileged:
        'Accounts that can edit content sign in on the admin console, not on this site. Open the admin console to continue.',
    },
    twoFactor: {
      title: 'Enter your verification code',
      totpDescription:
        'Open your authenticator app and enter the current code for Abyss.',
      emailDescription: 'We sent a code to the email address of this account.',
      emailWarning:
        'Anyone who can read your email can use this code. An authenticator app is safer: switch in Security settings in the CMS after you sign in.',
      totpLabel: 'Authenticator code',
      emailLabel: 'Email code',
      totpHint: 'A new code appears every 30 seconds.',
      emailHint: 'The code works for 5 minutes.',
      codeInvalid: 'Enter the 6-digit code.',
      submit: 'Verify',
      cancel: 'Cancel',
      resend: 'Send a new code',
      resent: 'A new code is on its way.',
      expired:
        'Your sign-in timed out or had too many wrong codes. Sign in again.',
      errors: {
        invalidCode:
          'That code is wrong or has expired. Check it and try again.',
        unsupportedMethod:
          'This account uses a verification method this site does not support. Sign in through the CMS instead.',
      },
    },
  },
  notFound: {
    title: 'Page not found',
    description:
      'There is nothing at this address. Check the link and try again.',
  },
  status: {
    cardTitle: 'Content API',
    cardDescription: 'Liveness check on the API this site loads content from.',
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

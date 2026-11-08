/** Mock answer of the `SiteShell` operation: the text the site showed before it came from the API. */
export const SITE_SHELL_MOCK = {
  header: {
    name: 'Abyss',
    nav: [],
    author: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' },
  },
  siteText: {
    navLabel: 'Main',
    navCvLink: 'CV',
    openCms: 'Open CMS',
    signOutFailed: 'Sign-out did not reach the server, so you are still signed in. Try again.',
    signedInAs: 'Signed in as {name}',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'There is nothing at this address. Check the link and try again.',
    errorTitle: 'The CV could not be loaded',
    errorDescription:
      'Something went wrong while loading this page. Nothing was changed. Try again, or come back in a few minutes.',
    errorRetry: 'Try again',
  },
  signInText: {
    title: 'Sign in',
    description: 'Use the email and password of your Abyss account.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    rememberMeLabel: 'Keep me signed in',
    rememberMeHint: 'Use this only on a device you trust.',
    submit: 'Sign in',
    cancel: 'Cancel',
    humanCheck: {
      loading: 'Loading the security check',
      required: 'Complete the security check to continue.',
      expired: 'The security check expired. Complete it again.',
      failed: 'The security check could not load. Check your connection and reload the page.',
      unavailable: 'The security check is not set up on this site, so sign-in is unavailable.',
    },
    validation: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'Enter an email like name@example.com.',
      passwordRequired: 'Enter your password.',
    },
    errors: {
      invalidCredentials: 'The email or password is incorrect. Check both and try again.',
      rateLimitedSecondsOne: 'Too many sign-in attempts. Try again in {count} second.',
      rateLimitedSecondsOther: 'Too many sign-in attempts. Try again in {count} seconds.',
      rateLimitedMinutesOne: 'Too many sign-in attempts. Try again in {count} minute.',
      rateLimitedMinutesOther: 'Too many sign-in attempts. Try again in {count} minutes.',
      rateLimited: 'Too many sign-in attempts. Wait a few minutes, then try again.',
      network: 'Could not reach the server. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
      humanCheckFailed: 'The security check did not pass. Try again.',
      humanCheckUnavailable:
        'The security check is unavailable right now. Try again in a few minutes.',
      privileged:
        'Accounts that can edit content sign in on the admin console, not on this site. Open the admin console to continue.',
    },
    twoFactor: {
      title: 'Enter your verification code',
      totpDescription: 'Open your authenticator app and enter the current code for Abyss.',
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
      expired: 'Your sign-in timed out or had too many wrong codes. Sign in again.',
      invalidCode: 'That code is wrong or has expired. Check it and try again.',
      unsupportedMethod:
        'This account uses a verification method this site does not support. Sign in through the CMS instead.',
    },
  },
} as const;

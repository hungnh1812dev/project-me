import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  PASSWORD_LENGTH,
} from './auth.constants';

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
    forgotPassword: 'Forgot your password?',
    notices: {
      passwordReset: 'Your password was reset. Sign in with the new password.',
      passwordSet: 'Your password is set. Sign in to start using Abyss CMS.',
    },
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
  password: {
    emailLabel: 'Email',
    codeLabel: 'Verification code',
    codeHint: `The ${OTP_CODE_LENGTH}-digit code from the email. It works for ${OTP_TTL_MINUTES} minutes.`,
    newPasswordLabel: 'New password',
    newPasswordHint: `${PASSWORD_LENGTH.MIN} to ${PASSWORD_LENGTH.MAX} characters. A few unrelated words work well.`,
    confirmPasswordLabel: 'Confirm new password',
    totpLabel: 'Authenticator code',
    totpHint: 'The current code from your authenticator app.',
    resendCode: 'Send a new code',
    codeResent: (email: string) =>
      `If ${email} belongs to an account, a new code is on its way.`,
    backToSignIn: 'Back to sign in',
    validation: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'Enter an email like name@example.com.',
      codeInvalid: `Enter the ${OTP_CODE_LENGTH}-digit code from the email.`,
      passwordTooShort: `Use at least ${PASSWORD_LENGTH.MIN} characters.`,
      passwordTooLong: `Use at most ${PASSWORD_LENGTH.MAX} characters.`,
      passwordsDiffer: 'The two passwords do not match.',
      totpInvalid: `Enter the ${OTP_CODE_LENGTH}-digit code from your authenticator app.`,
    },
    errors: {
      invalidCode:
        'That code is wrong or has expired. Check the latest email, or send a new code.',
      weakPassword: `Choose a password of ${PASSWORD_LENGTH.MIN} to ${PASSWORD_LENGTH.MAX} characters.`,
      totpRequired:
        'This account also uses an authenticator app. Enter its current code to finish.',
      rateLimitedSeconds: (seconds: number) =>
        `Too many attempts. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      rateLimitedMinutes: (minutes: number) =>
        `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      rateLimited: 'Too many attempts. Wait a few minutes, then try again.',
      network:
        'Could not reach the server. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
    },
    reset: {
      requestTitle: 'Reset your password',
      requestDescription:
        'Enter the email of your account and we will send you a code to choose a new password.',
      sendCode: 'Send code',
      title: 'Choose a new password',
      codeSent: (email: string) =>
        `If ${email} belongs to an account, we sent a code to it. Resetting signs you out on every device.`,
      submit: 'Reset password',
      otherEmail: 'Use a different email',
    },
    set: {
      title: 'Set your password',
      description:
        'Enter the code from your invitation email and choose a password for your account.',
      submit: 'Set password',
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

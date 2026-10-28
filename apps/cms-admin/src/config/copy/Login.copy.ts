import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  TOTP_CODE_LENGTH,
  TOTP_PERIOD_SECONDS,
} from '../Auth.constants';

export const LOGIN_COPY = {
  title: 'Sign in',
  description: 'Use the email and password of your Abyss CMS account.',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  submit: 'Sign in',
  forgotPassword: 'Forgot your password?',
  notices: {
    passwordReset: 'Your password was reset. Sign in with the new password.',
    passwordSet: 'Your password is set. Sign in to start using Abyss CMS.',
    passwordChanged:
      'Your password was changed and every session was signed out. Sign in with the new password.',
    ownerCreated:
      'Owner account created. Sign in, then turn on two-factor in Security settings.',
    setupComplete: 'Setup is already complete. Sign in.',
  },
  setupPrompt: {
    message: 'This console has no owner yet.',
    action: 'Set up the owner account',
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
    network: 'Could not reach the server. Check your connection and try again.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
  },
  twoFactor: {
    title: 'Enter your verification code',
    totpDescription:
      'Open your authenticator app and enter the current code for Abyss CMS.',
    emailDescription: 'We sent a code to the email address of this account.',
    emailWarning:
      'Anyone who can read your email can use this code. An authenticator app is safer: switch in Security settings after you sign in.',
    totpLabel: 'Authenticator code',
    emailLabel: 'Email code',
    totpHint: `${TOTP_CODE_LENGTH} digits. A new code appears every ${TOTP_PERIOD_SECONDS} seconds.`,
    emailHint: `${OTP_CODE_LENGTH} digits. The code works for ${OTP_TTL_MINUTES} minutes.`,
    codeInvalid: `Enter the ${TOTP_CODE_LENGTH}-digit code.`,
    submit: 'Verify',
    cancel: 'Cancel',
    resend: 'Send a new code',
    resent: 'A new code is on its way.',
    expired:
      'Your sign-in timed out or had too many wrong codes. Sign in again.',
    errors: {
      invalidCode: 'That code is wrong or has expired. Check it and try again.',
      unsupportedMethod:
        'This account uses a verification method the admin console does not support. Contact the owner.',
    },
  },
} as const;

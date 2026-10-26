import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  PASSWORD_LENGTH,
} from '../auth.constants';

/** Text shared by several features: app shell, session, password rules, navigation labels. */
export const COMMON_COPY = {
  retry: 'Try again',
} as const;

export const APP_COPY = {
  name: 'Abyss CMS',
} as const;

export const SESSION_COPY = {
  restoring: 'Restoring your session',
  signedInAs: 'Signed in as',
  signOut: 'Sign out',
  securityLink: 'Security',
  mainNav: 'Account',
} as const;

export const PASSWORD_COPY = {
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
    network: 'Could not reach the server. Check your connection and try again.',
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
} as const;

export const NAV_COPY = {
  label: 'Main',
  accounts: 'Users',
  roles: 'Roles and permissions',
  apiTokens: 'API tokens',
  media: 'Media',
  reviewer: 'Reviewers',
  content: 'Content',
  singleTypes: 'Single types',
  collectionTypes: 'Collection types',
  utilities: 'Utilities',
  systemSettings: 'System settings',
  menu: 'Menu',
  closeMenu: 'Close menu',
  loading: 'Loading the menu',
  catalogError: 'Could not load the content types.',
  retryCatalog: 'Reload content types',
} as const;

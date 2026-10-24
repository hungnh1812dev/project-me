import { PASSWORD_LENGTH } from '../auth.constants';

export const SETUP_COPY = {
  title: 'Set up the owner account',
  description:
    'Create the one owner account. You need the setup token from the cms-api secret (OWNER_SETUP_TOKEN).',
  checking: 'Checking the setup status',
  statusFailed:
    'Could not check whether setup is open. Check your connection and try again.',
  retry: 'Try again',
  tokenLabel: 'Setup token',
  emailLabel: 'Email',
  displayNameLabel: 'Display name (optional)',
  displayNameHint: 'Defaults to the part of your email before the @.',
  passwordLabel: 'Password',
  passwordHint: `${PASSWORD_LENGTH.MIN} to ${PASSWORD_LENGTH.MAX} characters. A few unrelated words work well.`,
  confirmPasswordLabel: 'Repeat password',
  submit: 'Create owner account',
  validation: {
    tokenRequired: 'Enter the setup token.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter an email like name@example.com.',
    displayNameTooLong: 'Use at most 100 characters.',
    passwordTooShort: `Use at least ${PASSWORD_LENGTH.MIN} characters.`,
    passwordTooLong: `Use at most ${PASSWORD_LENGTH.MAX} characters.`,
    passwordsDiffer: 'The two passwords do not match.',
  },
  errors: {
    tokenInvalid: 'This setup token is not valid.',
    emailTaken: 'An account with this email already exists.',
    rateLimited: 'Too many attempts. Wait a few minutes and try again.',
    network: 'Could not reach the server. Check your connection and try again.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
  },
} as const;

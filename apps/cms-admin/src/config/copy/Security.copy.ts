import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  TOTP_CODE_LENGTH,
} from '../Auth.constants';

export const SECURITY_COPY = {
  title: 'Security',
  description:
    'Protect your account with a second sign-in step and keep your password current.',
  twoFactor: {
    title: 'Two-factor authentication',
    description:
      'After your password, sign-in also asks for a code. This stops someone who only knows your password.',
    statusLabel: 'Status',
    statusOff: 'Off',
    statusTotp: 'On, authenticator app',
    statusEmail: 'On, email codes',
    offHint:
      'We recommend an authenticator app such as 1Password, Google Authenticator or Microsoft Authenticator.',
    emailWarning:
      'Email codes are weaker: anyone who can read your email can sign in. To switch to an authenticator app, turn two-factor off, then set up the app.',
    setUpTotp: 'Set up authenticator app',
    emailInstead: 'Use email codes instead',
    turnOff: 'Turn off two-factor',
    enabledTotp:
      'Two-factor authentication is on. Sign-in now asks for a code from your authenticator app.',
    enabledEmail:
      'Two-factor authentication is on. Sign-in now asks for a code sent to your email.',
    disabled:
      'Two-factor authentication is off. Sign-in asks only for your password.',
  },
  totpSetup: {
    title: 'Set up an authenticator app',
    loading: 'Preparing your setup key',
    scanStep: '1. Scan this QR code with your authenticator app.',
    manualKeyLabel: "Can't scan it? Enter this key instead:",
    qrLabel: 'QR code for your authenticator app',
    codeStep: '2. Enter the code the app shows and your password to confirm.',
    submit: 'Turn on',
    cancel: 'Cancel',
    retry: 'Try again',
    loadFailed: 'Could not start the setup.',
  },
  emailSetup: {
    title: 'Use email codes',
    description: (email: string) =>
      `Sign-in will ask for a code we send to ${email}. We just sent the first one to confirm the address.`,
    submit: 'Turn on email codes',
    cancel: 'Cancel',
  },
  disable: {
    title: 'Turn off two-factor authentication',
    description:
      'Sign-in will ask only for your password. Confirm with your password and a current code.',
    emailCodeSent: 'We sent a code to your email.',
    submit: 'Turn off two-factor',
    cancel: 'Keep it on',
  },
  fields: {
    currentPassword: 'Current password',
    totpCode: 'Authenticator code',
    emailCode: 'Email code',
    totpHint: `The ${TOTP_CODE_LENGTH}-digit code your app shows right now.`,
    emailHint: `The ${OTP_CODE_LENGTH}-digit code from the email. It works for ${OTP_TTL_MINUTES} minutes.`,
  },
  resendCode: 'Send a new code',
  codeResent: 'A new code is on its way.',
  changePassword: {
    title: 'Password',
    description:
      'Changing your password signs you out on every device, this one included.',
    submit: 'Change password',
  },
  validation: {
    passwordRequired: 'Enter your current password.',
    codeInvalid: `Enter the ${TOTP_CODE_LENGTH}-digit code.`,
  },
  errors: {
    wrongPassword: 'That password is incorrect.',
    invalidCode: 'That code is wrong or has expired. Check it and try again.',
    stateChanged:
      'Your two-factor settings changed in another window. The page now shows the current state.',
    setupExpired: 'The setup key was replaced. Scan the new QR code.',
  },
} as const;

import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  PASSWORD_LENGTH,
  TOTP_CODE_LENGTH,
  TOTP_PERIOD_SECONDS,
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
    securityLink: 'Security',
    mainNav: 'Account',
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
      passwordChanged:
        'Your password was changed and every session was signed out. Sign in with the new password.',
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
        invalidCode:
          'That code is wrong or has expired. Check it and try again.',
        unsupportedMethod:
          'This account uses a verification method the admin console does not support. Contact the owner.',
      },
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
  security: {
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

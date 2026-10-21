import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  PASSWORD_LENGTH,
  TOTP_CODE_LENGTH,
  TOTP_PERIOD_SECONDS,
} from './auth.constants';
import { ACCOUNT_LIMITS, API_TOKEN_LIMITS } from './access.constants';

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
  access: {
    nav: {
      label: 'Main',
      accounts: 'Accounts',
      roles: 'Roles',
      apiTokens: 'API tokens',
    },
    errors: {
      network:
        'Could not reach the server. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
      rankForbidden:
        'You can only manage accounts and roles ranked below your own role.',
      permissionNotHeld:
        'You cannot grant a permission you do not hold yourself. Remove the marked permissions and save again.',
      scopeNotHeld:
        'A token can only get permissions you hold yourself. Remove the marked permissions and save again.',
      retry: 'Try again',
    },
    accounts: {
      title: 'Accounts',
      description:
        'People who can sign in to the admin console, and the role that decides what each of them can do.',
      invite: 'Invite account',
      tableLabel: 'Accounts',
      columns: {
        name: 'Name',
        role: 'Role',
        status: 'Status',
        twoFactor: 'Two-factor',
        created: 'Added',
        actions: 'Actions',
      },
      you: 'You',
      status: {
        invited: 'Invited',
        active: 'Active',
        disabled: 'Disabled',
      },
      twoFactorOn: 'On',
      twoFactorOff: 'Off',
      loading: 'Loading accounts',
      loadFailed: 'Could not load the accounts.',
      forbidden:
        'Your role cannot see accounts. Ask the owner if you need access.',
      empty: 'No accounts yet.',
      emptyHint: 'Invite the first person who should work in Abyss CMS.',
      enable: 'Enable',
      enableLabel: (name: string) => `Enable ${name}`,
      resend: 'Resend invite',
      resendLabel: (name: string) => `Resend invite to ${name}`,
      enabled: (name: string) => `${name} is enabled and can sign in again.`,
      enabledInvited: (name: string) =>
        `${name} is enabled. They have not set a password yet, so resend the invite if they need a new code.`,
      alreadyEnabled:
        'That account is no longer disabled. The list is updated.',
      resent: (email: string) =>
        `New invitation sent to ${email}. Earlier codes no longer work.`,
      resentNoEmail: (email: string) =>
        `A new code was created for ${email}, but the email could not be sent. They can ask for a code on the Set password page.`,
      notInvited:
        'That account already set a password, so there is nothing to resend. The list is updated.',
      pagination: {
        label: 'Accounts pages',
        range: (from: number, to: number, total: number) =>
          `${from}\u2013${to} of ${total}`,
        previous: 'Previous',
        next: 'Next',
      },
      disable: 'Disable',
      disableLabel: (name: string) => `Disable ${name}`,
      invited: (email: string) =>
        `Invitation sent to ${email}. They choose a password with the code from the email.`,
      invitedNoEmail: (email: string) =>
        `The account for ${email} was created, but the invitation email could not be sent. They can ask for a code on the Set password page.`,
      disabled: (name: string) =>
        `${name} is disabled and was signed out everywhere.`,
      alreadyDisabled:
        'That account was already disabled. The list is updated.',
      gone: 'That account no longer exists. The list is updated.',
    },
    invite: {
      title: 'Invite an account',
      description:
        'We email them a code to set their password. You can change their role later.',
      emailLabel: 'Email',
      displayNameLabel: 'Display name',
      displayNameHint: 'Shown in the admin console, for example "Linh Pham".',
      roleLabel: 'Role',
      rolePlaceholder: 'Choose a role',
      roleHint: 'Only roles ranked below yours are listed.',
      submit: 'Send invitation',
      cancel: 'Cancel',
      validation: {
        emailRequired: 'Enter their email address.',
        emailInvalid: 'Enter an email like name@example.com.',
        emailTooLong: `Use at most ${ACCOUNT_LIMITS.EMAIL_MAX_LENGTH} characters.`,
        displayNameRequired: 'Enter the name to show for them.',
        displayNameTooLong: `Use at most ${ACCOUNT_LIMITS.DISPLAY_NAME_MAX_LENGTH} characters.`,
        roleRequired: 'Choose the role they get.',
      },
      errors: {
        emailTaken:
          'An account with this email already exists. Use a different email.',
        roleNotAssignable:
          'This role cannot be given to an account. Choose another role.',
        invalid:
          'Some details were not accepted. Check the fields and try again.',
      },
    },
    disable: {
      title: (name: string) => `Disable ${name}?`,
      description: (email: string) =>
        `${email} is signed out everywhere and can no longer sign in. You can enable the account again later.`,
      submit: (name: string) => `Disable ${name}`,
      cancel: 'Cancel',
    },
    apiTokens: {
      title: 'API tokens',
      description:
        'Tokens let scripts and other systems call the content API. A token never has more than the account that created it.',
      create: 'Create token',
      tableLabel: 'API tokens',
      columns: {
        name: 'Token',
        access: 'Access',
        status: 'Status',
        expires: 'Expires',
        lastUsed: 'Last used',
        createdBy: 'Created by',
        actions: 'Actions',
      },
      status: {
        active: 'Active',
        revoked: 'Revoked',
        expired: 'Expired',
      },
      noExpiry: 'Never',
      neverUsed: 'Never',
      you: 'You',
      access: (permissions: number, subjects: string) =>
        `${permissions} ${permissions === 1 ? 'permission' : 'permissions'} on ${subjects}`,
      noAccess: 'No permissions',
      loading: 'Loading API tokens',
      loadFailed: 'Could not load the API tokens.',
      forbidden:
        'Your role cannot see API tokens. Ask the owner if you need access.',
      empty: 'No API tokens yet.',
      emptyHint:
        'Create a token when a script or another system needs to read or write content.',
      emptyHintReadOnly: 'Tokens created by your team appear here.',
      edit: 'Edit',
      editLabel: (name: string) => `Edit ${name}`,
      revoke: 'Revoke',
      revokeLabel: (name: string) => `Revoke ${name}`,
      created: (name: string) =>
        `Token ${name} is created. Anything using it can call the API now.`,
      updated: (name: string) => `Token ${name} is updated.`,
      revoked: (name: string) =>
        `Token ${name} is revoked and no longer works.`,
      alreadyRevoked: 'That token was already revoked. The list is updated.',
      gone: 'That token no longer exists or you cannot manage it. The list is updated.',
      pagination: {
        label: 'API tokens pages',
        range: (from: number, to: number, total: number) =>
          `${from}\u2013${to} of ${total}`,
        previous: 'Previous',
        next: 'Next',
      },
    },
    tokenForm: {
      createTitle: 'Create an API token',
      editTitle: (name: string) => `Edit ${name}`,
      createDescription:
        'Choose what the token may do. You see the token once, right after you create it.',
      editDescription:
        'Changes apply to the next request made with this token. The token itself does not change.',
      nameLabel: 'Name',
      nameHint: 'Say what uses it, for example "Website build".',
      expiresLabel: 'Expires on',
      expiresHint:
        'Optional. The token stops working at the end of this day, in your time zone. Leave empty for no expiry.',
      scopeTitle: 'Permissions',
      scopeDescription:
        'Content only. The token can never do more than your own role allows, even if you change roles later.',
      submitCreate: 'Create token',
      submitEdit: 'Save changes',
      cancel: 'Cancel',
      validation: {
        nameRequired: 'Enter a name for the token.',
        nameTooLong: `Use at most ${API_TOKEN_LIMITS.NAME_MAX_LENGTH} characters.`,
        expiryPast: 'Choose today or a later date.',
        expiryInvalid: 'Enter a valid date.',
        scopeRequired: 'Choose at least one permission.',
        scopeTooLong: `Use at most ${API_TOKEN_LIMITS.MAX_SCOPE_ENTRIES} permissions. Use "All content types" to cover more.`,
      },
      errors: {
        invalid:
          'Some details were not accepted. Check the marked fields and try again.',
        revoked:
          'This token was revoked in the meantime and cannot be changed.',
      },
    },
    tokenScope: {
      cellLabel: (action: string, subject: string) => `${action} ${subject}`,
      fields: 'Fields',
      fieldsLabel: (subject: string) => `Fields for ${subject}`,
      fieldsEmpty: 'Choose an action in this row to limit its fields.',
      notHeld: 'Not allowed by your role',
      notHeldHint:
        'Greyed-out boxes are permissions you do not hold yourself, so you cannot give them to a token.',
    },
    tokenReveal: {
      title: (name: string) => `Copy the token for ${name}`,
      description:
        'This is the only time the token is shown. Store it in a password manager or your secret store now.',
      warning:
        'If you close this without copying it, the token cannot be shown again. You would have to create a new one.',
      label: 'API token',
      copy: 'Copy token',
      copied: 'Copied to the clipboard.',
      copyFailed: 'Could not copy automatically. Select the token and copy it.',
      done: 'I have copied it',
    },
    revokeToken: {
      title: (name: string) => `Revoke ${name}?`,
      description:
        'Anything using this token stops working immediately. This cannot be undone; create a new token if you need access again.',
      submit: (name: string) => `Revoke ${name}`,
      cancel: 'Cancel',
    },
    roles: {
      title: 'Roles',
      description:
        'A role is a set of permissions. Accounts get exactly what their role allows.',
      tableLabel: 'Roles',
      columns: {
        name: 'Role',
        rank: 'Rank',
        accounts: 'Accounts',
        type: 'Type',
      },
      system: 'System',
      custom: 'Custom',
      loading: 'Loading roles',
      loadFailed: 'Could not load the roles.',
      forbidden:
        'Your role cannot see roles. Ask the owner if you need access.',
      empty: 'No roles found.',
      open: (name: string) => `Permissions of ${name}`,
    },
    role: {
      back: 'All roles',
      meta: (slug: string, rank: number, accounts: number) =>
        `${slug} · rank ${rank} · ${accounts} ${accounts === 1 ? 'account' : 'accounts'}`,
      notFound: 'This role does not exist or you cannot see it.',
      owner:
        'The owner holds every permission. There is nothing to configure for this role.',
      readOnly:
        'You can view this role but not change it: it ranks at or above your own role.',
      readOnlyNoUpdate: 'Your role can view roles but not change them.',
      save: 'Save permissions',
      discard: 'Discard changes',
      unsaved: 'You have unsaved changes.',
      saved:
        'Permissions saved. Accounts with this role get them on their next request.',
      invalid:
        'Some permissions were not accepted. Fix the marked rows and save again.',
      conditionsInvalidJson:
        'Fix the conditions that are not valid JSON before saving.',
      contentTypesFailed:
        'Could not load the content types, so field access cannot be shown.',
    },
    matrix: {
      contentTitle: 'Content',
      contentDescription:
        '"All content types" applies to every type without its own row. A type with any checked action uses only its own row for that action.',
      systemTitle: 'System',
      systemDescription: 'Administration areas of the console.',
      subjectColumn: 'Area',
      notAvailable: 'Not available',
      notHeldHint:
        'Greyed-out boxes are permissions you do not hold yourself, so you cannot grant them.',
      wildcard: 'All content types',
      unknownType: (slug: string) => `${slug} (no longer registered)`,
      subjects: {
        accounts: 'Accounts',
        roles: 'Roles',
        api_tokens: 'API tokens',
        media: 'Media',
        audit_logs: 'Audit logs',
        reviewer_settings: 'Reviewer settings',
      },
      actions: {
        read: 'Read',
        create: 'Create',
        update: 'Update',
        delete: 'Delete',
        publish: 'Publish',
        unpublish: 'Unpublish',
      },
      cellLabel: (action: string, subject: string) => `${action} ${subject}`,
      details: 'Fields and conditions',
      conditionsOnly: 'Conditions',
      detailsLabel: (subject: string) => `Fields and conditions for ${subject}`,
      detailsEmpty:
        'Check an action in this row to set its field access and conditions.',
      extraRows: (count: number) =>
        `${count} more ${count === 1 ? 'row' : 'rows'} for this action came from the API and are kept unchanged.`,
    },
    fields: {
      readable: 'Readable fields',
      writable: (action: string) => `Writable fields (${action})`,
      all: 'All fields',
      some: 'Only selected fields',
      sensitive: 'Sensitive',
      component: 'Group',
      covered: 'Included with its group',
      noneSelected:
        'No fields selected: only system fields such as the id and dates are visible.',
      noneSelectedWrite: 'No fields selected: nothing can be written.',
    },
    conditions: {
      summary: (action: string) => `Advanced: row conditions (${action})`,
      label: (action: string) => `Conditions for ${action}`,
      hint: 'JSON in the conditions format, for example {"all":[{"field":"createdBy","op":"eq","value":"$actor.id"}]}. Leave empty for no condition. The server checks it when you save.',
      invalidJson: 'This is not valid JSON. Check brackets, quotes and commas.',
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

/** Text of the sign-in dialog and its two-factor step; the `*Seconds*` and `*Minutes*` texts have the `{count}` placeholder. */
export interface SignInText {
  title: string;
  description: string;
  emailLabel: string;
  passwordLabel: string;
  rememberMeLabel: string;
  rememberMeHint: string;
  submit: string;
  cancel: string;
  humanCheck: {
    loading: string;
    required: string;
    expired: string;
    failed: string;
    unavailable: string;
  };
  validation: {
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
  };
  errors: {
    invalidCredentials: string;
    rateLimitedSecondsOne: string;
    rateLimitedSecondsOther: string;
    rateLimitedMinutesOne: string;
    rateLimitedMinutesOther: string;
    rateLimited: string;
    network: string;
    unexpected: string;
    humanCheckFailed: string;
    humanCheckUnavailable: string;
    privileged: string;
  };
  twoFactor: {
    title: string;
    totpDescription: string;
    emailDescription: string;
    emailWarning: string;
    totpLabel: string;
    emailLabel: string;
    totpHint: string;
    emailHint: string;
    codeInvalid: string;
    submit: string;
    cancel: string;
    resend: string;
    resent: string;
    expired: string;
    invalidCode: string;
    unsupportedMethod: string;
  };
}

export interface SignIn {
  signInText: SignInText;
}

export const SIGN_IN_OPERATION_NAME = 'SignIn';

/** The sign-in dialog text; `signInText` is a GraphQL alias of the cms-api root field `moduleSignIn`, so the response key stays `signInText`. */
export const SIGN_IN_ROOT_FIELDS = {
  signInText: `: moduleSignIn {
    title
    description
    emailLabel
    passwordLabel
    rememberMeLabel
    rememberMeHint
    submit
    cancel
    humanCheck {
      loading
      required
      expired
      failed
      unavailable
    }
    validation {
      emailRequired
      emailInvalid
      passwordRequired
    }
    errors {
      invalidCredentials
      rateLimitedSecondsOne
      rateLimitedSecondsOther
      rateLimitedMinutesOne
      rateLimitedMinutesOther
      rateLimited
      network
      unexpected
      humanCheckFailed
      humanCheckUnavailable
      privileged
    }
    twoFactor {
      title
      totpDescription
      emailDescription
      emailWarning
      totpLabel
      emailLabel
      totpHint
      emailHint
      codeInvalid
      submit
      cancel
      resend
      resent
      expired
      invalidCode
      unsupportedMethod
    }
  }`,
} as const;

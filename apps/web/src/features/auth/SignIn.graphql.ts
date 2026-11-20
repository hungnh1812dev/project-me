/**
 * Text of the sign-in dialog, its two-factor step and the signed-in account menu; the `*Seconds*` and
 * `*Minutes*` texts have the `{count}` placeholder, `signedInAs` has `{name}`.
 */
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
  signedInAs: string | null;
  signOutFailed: string | null;
}

export interface SignIn {
  signInText: SignInText;
}

/** The sign-in text; `signInText` is a GraphQL alias of the cms-api root field `moduleAuth`, so the response key stays `signInText`. */
export const SIGN_IN_QUERY = `query SignIn {
signInText: moduleAuth {
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
    signedInAs
    signOutFailed
  }
}`;

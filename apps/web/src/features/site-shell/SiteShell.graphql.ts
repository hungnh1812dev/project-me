export interface HeaderNavLink {
  title: string | null;
  link: string | null;
  requiresRole: string | null;
}

export interface HeaderNav extends HeaderNavLink {
  subNavigations: HeaderNavLink[] | null;
}

export interface SiteHeader {
  name: string | null;
  nav: HeaderNav[] | null;
  author: { btnLoginText: string | null; btnLogoutText: string | null } | null;
}

/** Text shared by the header, the account menu, and the error and not-found pages. */
export interface SiteText {
  navLabel: string;
  navCvLink: string;
  openCms: string;
  signOutFailed: string;
  /** Has the `{name}` placeholder. */
  signedInAs: string;
  notFoundTitle: string;
  notFoundDescription: string;
  errorTitle: string;
  errorDescription: string;
  errorRetry: string;
}

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

export interface SiteShell {
  header: SiteHeader;
  siteText: SiteText;
  signInText: SignInText;
}

export const SITE_SHELL_OPERATION_NAME = 'SiteShell';

/**
 * The header and every shared text of the site: each root field's text after its name.
 * `signInText` is a GraphQL alias of the cms-api root field `moduleSignIn`, so the response key stays `signInText`.
 */
export const SITE_SHELL_ROOT_FIELDS = {
  header: `{
    name
    nav {
      title
      link
      requiresRole
      subNavigations {
        title
        link
        requiresRole
      }
    }
    author {
      btnLoginText
      btnLogoutText
    }
  }`,
  siteText: `{
    navLabel
    navCvLink
    openCms
    signOutFailed
    signedInAs
    notFoundTitle
    notFoundDescription
    errorTitle
    errorDescription
    errorRetry
  }`,
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

/** User-facing text. One place until an i18n module exists. */
export const COPY = {
  app: {
    name: 'Abyss',
  },
  page: {
    title: 'System status',
    description:
      'The public site is not live yet. This page confirms the site can reach the content API through the same domain.',
  },
  session: {
    signIn: 'Sign in',
    signOut: 'Sign out',
    openCms: 'Open CMS',
    signOutFailed:
      'Sign-out did not reach the server, so you are still signed in. Try again.',
    signedInAs: (name: string) => `Signed in as ${name}`,
    reviewing: 'Reviewing as a guest',
    endReview: 'End review',
  },
  reviewer: {
    open: 'Reviewer access',
    title: 'Request reviewer access',
    description:
      'Look around as a read-only guest for 24 hours. Tell us a little about your visit; please do not include personal details.',
    stepLabel: (step: number, total: number) => `Step ${step} of ${total}`,
    back: 'Back',
    next: 'Next',
    cancel: 'Cancel',
    submit: 'Start review',
    steps: {
      role: 'Who are you?',
      purposes: 'Why are you visiting?',
      notes: 'Anything else?',
    },
    role: {
      label: 'Your role',
      placeholder: 'Choose a role',
      other: 'Other',
      otherLabel: 'Describe your role',
    },
    purposes: {
      legend: 'Purpose of your visit',
      hint: 'Optional. Pick all that apply.',
      other: 'Other',
      otherLabel: 'Describe your purpose',
    },
    notes: {
      label: 'Notes for the site owner',
      hint: (max: number) => `Optional. Plain text, up to ${max} characters.`,
      count: (used: number, max: number) => `${used} / ${max}`,
    },
    turnstile: {
      label: 'Verification',
      loading: 'Loading the verification check',
      required: 'Complete the verification check to continue.',
      expired: 'The verification check expired. Complete it again.',
      failed:
        'The verification check could not load. Check your connection and reload the page.',
    },
    validation: {
      roleRequired: 'Choose your role.',
      roleOtherRequired: 'Describe your role.',
      purposeOtherRequired: 'Describe your purpose, or untick Other.',
      notesTooLong: (max: number) => `Use at most ${max} characters.`,
    },
    errors: {
      disabled: 'Reviewer access is switched off right now.',
      unavailable:
        'Reviewer access is temporarily unavailable. Try again later.',
      turnstileFailed:
        'The verification check did not pass. Complete it again and retry.',
      ipLimited: 'A review session was already started from this connection.',
      ipLimitedSeconds: (seconds: number) =>
        `A review session was already started from this connection. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`,
      ipLimitedMinutes: (minutes: number) =>
        `A review session was already started from this connection. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      capacity: 'Too many review sessions are active. Try again later.',
      invalid: 'Some of your answers were not accepted. Check them and retry.',
      network:
        'Could not reach the server. Check your connection and try again.',
      unexpected: 'Something went wrong on our side. Try again in a moment.',
    },
  },
  login: {
    title: 'Sign in',
    description: 'Use the email and password of your Abyss account.',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    cancel: 'Cancel',
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
      privileged:
        'Accounts that can edit content sign in on the admin console, not on this site. Open the admin console to continue.',
    },
    twoFactor: {
      title: 'Enter your verification code',
      totpDescription:
        'Open your authenticator app and enter the current code for Abyss.',
      emailDescription: 'We sent a code to the email address of this account.',
      emailWarning:
        'Anyone who can read your email can use this code. An authenticator app is safer: switch in Security settings in the CMS after you sign in.',
      totpLabel: 'Authenticator code',
      emailLabel: 'Email code',
      totpHint: 'A new code appears every 30 seconds.',
      emailHint: 'The code works for 5 minutes.',
      codeInvalid: 'Enter the 6-digit code.',
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
          'This account uses a verification method this site does not support. Sign in through the CMS instead.',
      },
    },
  },
  notFound: {
    title: 'Page not found',
    description:
      'There is nothing at this address. Check the link and try again.',
  },
  cv: {
    loading: 'Loading the CV',
    refetchFailed:
      'The CV could not be loaded for your session. Reload the page to try again.',
    fallbackName: 'Curriculum vitae',
    emptyTitle: 'No CV published yet',
    emptyDescription:
      'The owner has not published a main resume. Check back later.',
    maskedValue: 'Sign in to view',
    maskedValueForReviewer: 'Hidden for reviewers',
    contact: {
      title: 'Contact',
      email: 'Email',
      phone: 'Phone',
      address: 'Address',
      linkedin: 'LinkedIn',
      github: 'GitHub',
    },
    sections: {
      summary: 'Summary',
      skills: 'Skills',
      experiences: 'Experience',
      educations: 'Education',
      languages: 'Languages',
      referees: 'Referees',
    },
    experience: {
      teamSize: (size: number) => `Team of ${size}`,
      projects: 'Projects',
      techStack: 'Tech stack',
      liveLink: 'Live site',
      repositoryLink: 'Repository',
      liveLinkName: (project: string) => `Live site of ${project}`,
      repositoryLinkName: (project: string) => `Repository of ${project}`,
      unnamedProject: 'Project',
    },
    referee: {
      phone: 'Phone',
    },
  },
  error: {
    title: 'The CV could not be loaded',
    description:
      'Something went wrong while loading this page. Nothing was changed. Try again, or come back in a few minutes.',
    retry: 'Try again',
  },
  status: {
    cardTitle: 'Content API',
    cardDescription: 'Liveness check on the API this site loads content from.',
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

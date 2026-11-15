/** Mock answer of the `SiteHeader` operation: the header text the site showed before it came from the API. */
export const SITE_HEADER_MOCK = {
  header: {
    name: 'Abyss',
    nav: [],
    author: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' },
  },
  headerText: {
    navLabel: 'Main',
    navCvLink: 'CV',
    openCms: 'Open CMS',
    signOutFailed: 'Sign-out did not reach the server, so you are still signed in. Try again.',
    signedInAs: 'Signed in as {name}',
  },
} as const;

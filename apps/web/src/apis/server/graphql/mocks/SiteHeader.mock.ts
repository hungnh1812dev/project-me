/** Mock answer of the `SiteHeader` operation: the header text the site showed before it came from the API. */
export const SITE_HEADER_MOCK = {
  header: {
    name: 'Abyss',
    navLabel: 'Main',
    navCvLink: 'CV',
    nav: [],
    author: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' },
  },
} as const;

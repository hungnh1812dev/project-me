/** Mock answer of the `SiteHeader` operation: the header text the site showed before it came from the API. */
export const SITE_HEADER_MOCK = {
  header: {
    appName: 'Abyss',
    navs: [{ title: 'CV', link: '/cv', subNavs: [] }],
    author: { btnLoginText: 'Sign in', btnLogoutText: 'Sign out' },
  },
} as const;

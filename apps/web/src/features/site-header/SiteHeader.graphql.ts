export interface HeaderNavLink {
  title: string | null;
  link: string | null;
  requiresRole: string | null;
}

export interface HeaderNav extends HeaderNavLink {
  subNavigations: HeaderNavLink[] | null;
}

export interface HeaderContent {
  name: string | null;
  nav: HeaderNav[] | null;
  navLabel: string | null;
  navCvLink: string | null;
  author: { btnLoginText: string | null; btnLogoutText: string | null } | null;
}

export interface SiteHeader {
  header: HeaderContent;
}

export const SITE_HEADER_OPERATION_NAME = 'SiteHeader';

/** The header with its text: each root field's text after its name. */
export const SITE_HEADER_ROOT_FIELDS = {
  header: `{
    name
    navLabel
    navCvLink
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
} as const;

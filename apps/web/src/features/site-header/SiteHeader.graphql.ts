export interface HeaderNavLink {
  title: string | null;
  link: string | null;
}

export interface HeaderNav extends HeaderNavLink {
  subNavs: HeaderNavLink[] | null;
}

export interface HeaderContent {
  appName: string | null;
  navs: HeaderNav[] | null;
  author: { btnLoginText: string | null; btnLogoutText: string | null } | null;
}

export interface SiteHeader {
  header: HeaderContent;
}

/** The header with its text. */
export const SITE_HEADER_QUERY = `query SiteHeader {
header {
    appName
    navs {
      title
      link
      subNavs {
        title
        link
      }
    }
    author {
      btnLoginText
      btnLogoutText
    }
  }
}`;

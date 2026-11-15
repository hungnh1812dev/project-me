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
  author: { btnLoginText: string | null; btnLogoutText: string | null } | null;
}

/** Text of the nav and the account menu; `signedInAs` has the `{name}` placeholder. */
export interface HeaderText {
  navLabel: string;
  navCvLink: string;
  openCms: string;
  signOutFailed: string;
  signedInAs: string;
}

export interface SiteHeader {
  header: HeaderContent;
  headerText: HeaderText;
}

export const SITE_HEADER_OPERATION_NAME = 'SiteHeader';

/**
 * The header and its text: each root field's text after its name.
 * `headerText` is a GraphQL alias of the cms-api root field `siteText`.
 */
export const SITE_HEADER_ROOT_FIELDS = {
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
  headerText: `: siteText {
    navLabel
    navCvLink
    openCms
    signOutFailed
    signedInAs
  }`,
} as const;

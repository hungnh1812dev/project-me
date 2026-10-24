/** Client-side routes of the admin console. No trailing slashes. */
export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  /** One-time owner setup, open only while the instance has no owner. */
  SETUP: '/setup',
  /** Named in the reset email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  RESET_PASSWORD: '/reset-password',
  /** Named in the invitation email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  SET_PASSWORD: '/set-password',
  /** Two-factor and password settings of the signed-in account. */
  SECURITY_SETTINGS: '/settings/security',
  /** Accounts list + invite. */
  ACCOUNTS: '/accounts',
  /** Roles list. */
  ROLES: '/roles',
  /** One role's permission matrix; `:roleId` = document id. */
  ROLE_PERMISSIONS: '/roles/:roleId',
  /** API tokens list, create, edit, revoke. */
  API_TOKENS: '/api-tokens',
  /** Media library: upload, alt text, delete. */
  MEDIA: '/media',
  /** Reviewer switch and sessions log, owner only. */
  REVIEWER_SESSIONS: '/reviewer',
  /** Collection list with bulk actions; `:slug` = content type. */
  CONTENT_LIST: '/content/:slug',
  /** New document of a content type; `:slug` = content type. */
  CONTENT_NEW: '/content/:slug/new',
  /** Edit one document's draft. */
  CONTENT_EDIT: '/content/:slug/:documentId',
} as const;

/** `/content/<slug>` */
export function contentListPath(slug: string): string {
  return APP_ROUTES.CONTENT_LIST.replace(':slug', encodeURIComponent(slug));
}

/** `/content/<slug>/new` */
export function contentNewPath(slug: string): string {
  return APP_ROUTES.CONTENT_NEW.replace(':slug', encodeURIComponent(slug));
}

/** `/content/<slug>/<documentId>` */
export function contentEditPath(slug: string, documentId: string): string {
  return APP_ROUTES.CONTENT_EDIT.replace(
    ':slug',
    encodeURIComponent(slug),
  ).replace(':documentId', encodeURIComponent(documentId));
}

/** `/roles/<id>`: the matrix page of one role. */
export function rolePermissionsPath(roleId: string): string {
  return APP_ROUTES.ROLE_PERMISSIONS.replace(
    ':roleId',
    encodeURIComponent(roleId),
  );
}

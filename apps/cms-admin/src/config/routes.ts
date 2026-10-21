/** Client-side routes of the admin console. No trailing slashes. */
export const APP_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  /** Named in the reset email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  RESET_PASSWORD: '/reset-password',
  /** Named in the invitation email (cms-api ADMIN_PAGE_PATHS); keep in sync. */
  SET_PASSWORD: '/set-password',
  /** Two-factor and password settings of the signed-in account (T13). */
  SECURITY_SETTINGS: '/settings/security',
  /** Accounts list + invite (T18). */
  ACCOUNTS: '/accounts',
  /** Roles list (T18). */
  ROLES: '/roles',
  /** One role's permission matrix (T18); `:roleId` = document id. */
  ROLE_PERMISSIONS: '/roles/:roleId',
  /** API tokens list, create, edit, revoke (T19). */
  API_TOKENS: '/api-tokens',
  /** Media library: upload, alt text, delete (T29). */
  MEDIA: '/media',
  /** New document of a content type (T23); `:slug` = content type. */
  CONTENT_NEW: '/content/:slug/new',
  /** Edit one document's draft (T23). */
  CONTENT_EDIT: '/content/:slug/:documentId',
} as const;

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

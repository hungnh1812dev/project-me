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
} as const;

/** `/roles/<id>`: the matrix page of one role. */
export function rolePermissionsPath(roleId: string): string {
  return APP_ROUTES.ROLE_PERMISSIONS.replace(
    ':roleId',
    encodeURIComponent(roleId),
  );
}

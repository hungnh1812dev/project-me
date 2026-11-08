import type { CurrentUser } from './Auth.api';

export interface RoleViewer {
  status: 'unknown' | 'anonymous' | 'authenticated';
  user: Pick<CurrentUser, 'role'> | null;
}

/**
 * Whether a page, nav item or section that declares `requiresRole` is shown
 * to the viewer. Nothing declared shows to everyone; a signed-out viewer, or
 * a session still `unknown`, sees nothing that declares a role.
 *
 * Display only, never access control (D3): no server, route or BFF check uses
 * it. What a role may read stays guarded by cms-api.
 */
export function isVisibleTo(requiresRole: string | null | undefined, viewer: RoleViewer): boolean {
  if (requiresRole === null || requiresRole === undefined || requiresRole === '') return true;
  if (viewer.status !== 'authenticated' || viewer.user === null) return false;
  return viewer.user.role === requiresRole;
}

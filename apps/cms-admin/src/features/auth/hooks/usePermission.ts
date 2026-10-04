import { useAppSelector } from '@/app/hooks';

import { checkPermissions, type PermissionOptions } from '../permissions/can';
import type { Decision } from '../permissions/policies';
import { selectPermissions } from '../store/selectors';

/** RBAC check against the signed-in user's permissions, with the reason for a denial. */
export function usePermissionDecision(
  required: string | readonly string[],
  options: PermissionOptions = {},
): Decision {
  const permissions = useAppSelector(selectPermissions);
  return checkPermissions(permissions, required, options);
}

/**
 * Whether the signed-in user holds `required` (every slug, or one slug with `mode: 'any'`).
 * Re-renders when the user's permissions change.
 */
export function usePermission(
  required: string | readonly string[],
  options: PermissionOptions = {},
): boolean {
  return usePermissionDecision(required, options).allowed;
}

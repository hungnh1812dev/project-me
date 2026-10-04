import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/app/hooks';
import type { ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';
import { can } from '@/features/auth/permissions/can';
import { guard } from '@/features/auth/permissions/guard';
import { selectActor } from '@/features/auth/store/selectors';

import {
  createPermission,
  deletePermission,
  getPermissions,
  updatePermission,
  type CreatePermissionInput,
  type UpdatePermissionInput,
} from '../api/permissionsApi';
import { settingsKeys } from '../queryKeys';
import type { Permission } from '../types';

/** P1: the permission catalog. Disabled without `permission:read`, and `decision` says why. */
export function usePermissions() {
  const decision = useCan('read', 'permission');
  const query = useQuery<Permission[], ApiError>({
    queryKey: settingsKeys.permissions(),
    queryFn: ({ signal }) => getPermissions(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

/** Invalidates the catalog after a successful write (AC-11). */
function useInvalidatePermissions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: settingsKeys.permissions() });
}

/** P2: creates a permission. Guarded by `create permission` (AC-6). */
export function useCreatePermission() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidatePermissions();
  return useMutation<Permission, ApiError, CreatePermissionInput>({
    mutationFn: async (input) => {
      guard(can(actor, 'create', 'permission'));
      return createPermission(input);
    },
    onSuccess: invalidate,
  });
}

export interface UpdatePermissionVariables {
  id: string;
  /** Only the changed fields (AC-26). */
  changes: UpdatePermissionInput;
}

/** P3: updates a permission's name and/or description. Guarded by `update permission` (AC-6). */
export function useUpdatePermission() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidatePermissions();
  return useMutation<Permission, ApiError, UpdatePermissionVariables>({
    mutationFn: async ({ id, changes }) => {
      guard(can(actor, 'update', 'permission'));
      return updatePermission(id, changes);
    },
    onSuccess: invalidate,
  });
}

/**
 * P4: deletes a permission by id. Guarded by `delete permission` (AC-6). A 409 rejects with the
 * conflict body for `parsePermissionConflict` (AC-27).
 */
export function useDeletePermission() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidatePermissions();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      guard(can(actor, 'delete', 'permission'));
      await deletePermission(id);
    },
    onSuccess: invalidate,
  });
}

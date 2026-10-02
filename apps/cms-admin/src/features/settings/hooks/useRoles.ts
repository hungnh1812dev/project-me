import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import type { ApiError } from '@/core/api/apiError';
import { cmsApi } from '@/core/api/CmsApi';
import { useCan } from '@/features/auth/hooks/useCan';
import { CURRENT_USER_QUERY_KEY } from '@/features/auth/hooks/useCurrentUserQuery';
import { can } from '@/features/auth/permissions/can';
import { guard } from '@/features/auth/permissions/guard';
import { userLoaded } from '@/features/auth/store/AuthSlice';
import { selectActor, selectCurrentUser } from '@/features/auth/store/selectors';
import type { MeUser, Role } from '@/features/auth/types';

import {
  createRole,
  deleteRole,
  getRoles,
  updateRole,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '../api/rolesApi';
import { settingsKeys } from '../queryKeys';

/** R1: every role. Disabled without `role:read` (AC-14), and `decision` says why. */
export function useRoles() {
  const decision = useCan('read', 'role');
  const query = useQuery<Role[], ApiError>({
    queryKey: settingsKeys.roles(),
    queryFn: ({ signal }) => getRoles(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

/** R2: creates a role. Guarded by `create role` (AC-6); invalidates `roles` (AC-11). */
export function useCreateRole() {
  const queryClient = useQueryClient();
  const actor = useAppSelector(selectActor);
  return useMutation<Role, ApiError, CreateRoleInput>({
    mutationFn: async (input) => {
      guard(can(actor, 'create', 'role'));
      return createRole(input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.roles() }),
  });
}

export interface UpdateRoleVariables {
  role: Pick<Role, 'documentId' | 'isDefault'>;
  /** Only the changed fields (AC-20, `roleChanges`). */
  changes: UpdateRoleInput;
}

/**
 * R3: updates a role with only the changed fields. Guarded by `update role` with `isDefault` and
 * the changed `fields`, so a default role's name or level is refused before any request (AC-6).
 * On success, invalidates `roles` and `users` (AC-11). When the role is the signed-in user's own,
 * it refetches `GET /auth/me` and dispatches `userLoaded`, so menus and `<Can>` checks follow
 * without a reload (AC-22); a failed refetch is ignored, since the update itself succeeded.
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const actor = useAppSelector(selectActor);
  const myRoleId = useAppSelector(selectCurrentUser)?.roleId ?? null;
  return useMutation<Role, ApiError, UpdateRoleVariables>({
    mutationFn: async ({ role, changes }) => {
      guard(
        can(actor, 'update', 'role', { isDefault: role.isDefault, fields: Object.keys(changes) }),
      );
      return updateRole(role.documentId, changes);
    },
    onSuccess: async (_, { role }) => {
      if (role.documentId === myRoleId) {
        try {
          const { data } = await cmsApi.get<MeUser>('/auth/me');
          dispatch(userLoaded(data));
          await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
        } catch {
          // The role was saved; the session picks the change up on its next load.
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.roles() }),
        queryClient.invalidateQueries({ queryKey: settingsKeys.users() }),
      ]);
    },
  });
}

/**
 * R4: deletes a role. Guarded by `delete role` with `isDefault`, so a default role is refused
 * before any request (AC-6, AC-21). On success, invalidates `roles` and `users` (AC-11).
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();
  const actor = useAppSelector(selectActor);
  return useMutation<void, ApiError, Pick<Role, 'documentId' | 'isDefault'>>({
    mutationFn: async (role) => {
      guard(can(actor, 'delete', 'role', { isDefault: role.isDefault }));
      await deleteRole(role.documentId);
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKeys.roles() }),
        queryClient.invalidateQueries({ queryKey: settingsKeys.users() }),
      ]),
  });
}

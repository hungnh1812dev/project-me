import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/app/hooks';
import type { ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';
import { can } from '@/features/auth/permissions/can';
import { guard } from '@/features/auth/permissions/guard';
import { selectActor } from '@/features/auth/store/selectors';

import { assignUserRole, deleteUser, getUsers } from '../api/usersApi';
import { settingsKeys } from '../queryKeys';
import type { User } from '../types';

/** U1: every user. Disabled without `user:read`, and `decision` says why. */
export function useUsers() {
  const decision = useCan('read', 'user');
  const query = useQuery<User[], ApiError>({
    queryKey: settingsKeys.users(),
    queryFn: ({ signal }) => getUsers(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

export interface AssignRoleVariables {
  userId: string;
  roleId: string;
  /** The target's current level; `undefined` when unknown (denied). */
  targetLevel: number | undefined;
  /** The level of the role being assigned. */
  newRoleLevel: number;
}

/**
 * U3: assigns a role. `assign_role` is checked first (self, hierarchy, `user:role_manager`), so a
 * denial sends no request (AC-6). On success, invalidates `users` (AC-11).
 */
export function useAssignRole() {
  const queryClient = useQueryClient();
  const actor = useAppSelector(selectActor);
  return useMutation<User, ApiError, AssignRoleVariables>({
    mutationFn: async ({ userId, roleId, targetLevel, newRoleLevel }) => {
      guard(can(actor, 'assign_role', 'user', { targetUserId: userId, targetLevel, newRoleLevel }));
      return assignUserRole(userId, roleId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

export interface DeleteUserVariables {
  userId: string;
  /** The target's level; `undefined` when unknown (denied). */
  targetLevel: number | undefined;
}

/**
 * U4: deletes a user. `delete user` is checked first (self, hierarchy, `user:manager`), so a
 * denial sends no request (AC-6). On success, invalidates `users` (AC-11).
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  const actor = useAppSelector(selectActor);
  return useMutation<void, ApiError, DeleteUserVariables>({
    mutationFn: async ({ userId, targetLevel }) => {
      guard(can(actor, 'delete', 'user', { targetUserId: userId, targetLevel }));
      await deleteUser(userId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

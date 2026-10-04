import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { ApiError } from '@/core/api/apiError';
import { CURRENT_USER_QUERY_KEY } from '@/features/auth/hooks/useCurrentUserQuery';
import { userLoaded } from '@/features/auth/store/AuthSlice';
import { selectCurrentUser } from '@/features/auth/store/selectors';
import type { MeUser } from '@/features/auth/types';

import { updateUserName } from '../api/usersApi';
import { settingsKeys } from '../queryKeys';
import type { User } from '../types';

export interface UpdateProfileVariables {
  /** Already trimmed and validated. */
  name: string;
}

/**
 * U2: renames the signed-in user with exactly `{ name }` (AC-40, D8). U2 needs only the bearer for
 * the user's own record, so the only client check is that someone is signed in. On success the new
 * name is written to `['auth','me']` and the session (`userLoaded`), so the header follows without
 * a reload, and `users` is invalidated (AC-11). A failure changes nothing.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const sessionUser = useAppSelector(selectCurrentUser);
  return useMutation<User, ApiError, UpdateProfileVariables>({
    mutationFn: async ({ name }) => {
      if (!sessionUser) {
        // Same shape as a policy denial: no request is sent.
        throw new ApiError({
          status: 403,
          code: 'ERR_CLIENT_FORBIDDEN',
          message: 'Sign in to change your name.',
        });
      }
      return updateUserName(sessionUser.documentId, name);
    },
    onSuccess: async (saved) => {
      const current = queryClient.getQueryData<MeUser>(CURRENT_USER_QUERY_KEY) ?? sessionUser;
      if (current) {
        const next: MeUser = { ...current, name: saved.name };
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, next);
        dispatch(userLoaded(next));
      }
      await queryClient.invalidateQueries({ queryKey: settingsKeys.users() });
    },
  });
}

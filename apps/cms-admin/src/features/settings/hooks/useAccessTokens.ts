import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppSelector } from '@/app/hooks';
import type { ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';
import { can } from '@/features/auth/permissions/can';
import { guard } from '@/features/auth/permissions/guard';
import { selectActor } from '@/features/auth/store/selectors';

import {
  createAccessToken,
  deleteAccessToken,
  getAccessTokens,
  revokeAccessToken,
  type CreateAccessTokenInput,
} from '../api/accessTokensApi';
import { settingsKeys } from '../queryKeys';
import type { AccessToken, AccessTokenSecret } from '../types';

/**
 * Secret-bearing mutations (T2, T3) resolve with the secret to the caller only. They never call
 * `setQueryData`, and `gcTime: 0` drops the finished mutation (and the secret in its state) from
 * the mutation cache as soon as the caller runs `reset()` or unmounts (AC-33).
 */
const SECRET_MUTATION = { gcTime: 0 } as const;

/** T1: every token, without secrets. Disabled without `api_token:read`, and `decision` says why. */
export function useAccessTokens() {
  const decision = useCan('read', 'api_token');
  const query = useQuery<AccessToken[], ApiError>({
    queryKey: settingsKeys.accessTokens(),
    queryFn: ({ signal }) => getAccessTokens(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

/** Invalidates the token list after a successful write (AC-11). */
function useInvalidateAccessTokens() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: settingsKeys.accessTokens() });
}

/** T2: creates a token and resolves with its one-time secret. Guarded by `create api_token`. */
export function useCreateAccessToken() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidateAccessTokens();
  return useMutation<AccessTokenSecret, ApiError, CreateAccessTokenInput>({
    ...SECRET_MUTATION,
    mutationFn: async (input) => {
      guard(can(actor, 'create', 'api_token'));
      return createAccessToken(input);
    },
    onSuccess: invalidate,
  });
}

/** T3: rotates a token's secret and resolves with the new one. Guarded by `revoke api_token`. */
export function useRevokeAccessToken() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidateAccessTokens();
  return useMutation<AccessTokenSecret, ApiError, string>({
    ...SECRET_MUTATION,
    mutationFn: async (id) => {
      guard(can(actor, 'revoke', 'api_token'));
      return revokeAccessToken(id);
    },
    onSuccess: invalidate,
  });
}

/** T4: deletes a token. Guarded by `delete api_token` (AC-6). */
export function useDeleteAccessToken() {
  const actor = useAppSelector(selectActor);
  const invalidate = useInvalidateAccessTokens();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      guard(can(actor, 'delete', 'api_token'));
      await deleteAccessToken(id);
    },
    onSuccess: invalidate,
  });
}

import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';
import type { Role } from '@/features/auth/types';

import { getRoles } from '../api/rolesApi';
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

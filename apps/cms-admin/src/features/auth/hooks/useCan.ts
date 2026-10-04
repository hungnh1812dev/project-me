import { useMemo } from 'react';

import { useAppSelector } from '@/app/hooks';

import { can } from '../permissions/can';
import type { Decision, PolicyAttrs } from '../permissions/policies';
import { selectActor, selectRoleLevel } from '../store/selectors';

/**
 * ABAC decision for the signed-in user. Recomputed when the user, `action`, `subject` or
 * `attrs` change; pass a memoized `attrs` object for a stable result.
 */
export function useCan(action: string, subject: string, attrs?: PolicyAttrs): Decision {
  const actor = useAppSelector(selectActor);
  return useMemo(() => can(actor, action, subject, attrs), [actor, action, subject, attrs]);
}

/** The signed-in user's role level, 0 when signed out or without a role. */
export function useRoleLevel(): number {
  return useAppSelector(selectRoleLevel);
}

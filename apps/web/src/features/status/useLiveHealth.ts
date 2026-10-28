import { useQuery } from '@tanstack/react-query';

import { HEALTH_STATUS_OK } from '../../config/Http.constants';
import { fetchLiveHealth, HEALTH_QUERY_KEYS } from './Health.api';

export type LiveHealthState = 'checking' | 'ok' | 'error';

export function useLiveHealth() {
  const query = useQuery({
    queryKey: HEALTH_QUERY_KEYS.live,
    queryFn: fetchLiveHealth,
  });

  const state: LiveHealthState = query.isPending
    ? 'checking'
    : query.isError || query.data?.status !== HEALTH_STATUS_OK
      ? 'error'
      : 'ok';
  const lastCheckedAt = Math.max(query.dataUpdatedAt, query.errorUpdatedAt);

  return {
    state,
    isFetching: query.isFetching,
    lastCheckedAt: lastCheckedAt > 0 ? new Date(lastCheckedAt) : undefined,
    refetch: query.refetch,
  };
}

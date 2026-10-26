import { useQuery } from '@tanstack/react-query';

import { HEALTH_STATUS_OK } from '../../config/Http.constants';
import { useHealthApi } from './health-api-context';
import { HEALTH_QUERY_KEYS } from './health.api';

export type LiveHealthState = 'checking' | 'ok' | 'error';

export function useLiveHealth() {
  const healthApi = useHealthApi();
  const query = useQuery({
    queryKey: HEALTH_QUERY_KEYS.live,
    queryFn: healthApi.fetchLive,
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

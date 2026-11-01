import { HEALTH_STATUS_OK } from '@configs/Http.constants';
import { HEALTH_QUERY_KEYS } from '@features/status/Health.api';
import { useHealthApi } from '@features/status/HealthApi.context';
import { useQuery } from '@tanstack/react-query';

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

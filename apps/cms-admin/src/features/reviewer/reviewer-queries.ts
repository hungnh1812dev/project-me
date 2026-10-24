import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { REVIEWER_SESSIONS_PAGE_SIZE } from './reviewer.constants';
import { useReviewerApi } from './reviewer-api-context';

export const REVIEWER_QUERY_KEYS = {
  enabled: ['reviewer', 'enabled'],
  sessions: ['reviewer', 'sessions'],
} as const;

export function useReviewerEnabledQuery() {
  const api = useReviewerApi();
  return useQuery({
    queryKey: REVIEWER_QUERY_KEYS.enabled,
    queryFn: api.isEnabled,
  });
}

export function useReviewerSessionsQuery(page: number) {
  const api = useReviewerApi();
  return useQuery({
    queryKey: [...REVIEWER_QUERY_KEYS.sessions, page],
    queryFn: () => api.listSessions(page, REVIEWER_SESSIONS_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
}

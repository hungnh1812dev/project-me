import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../apis/client/Api.client';
import { appEnv } from '../../configs/Browser.env';
import { REVIEWER_STATUS_STALE_MS } from '../../configs/Reviewer.constants';
import { useWebSession } from '../session';
import { createReviewerApi } from './Reviewer.api';

export const REVIEWER_QUERY_KEYS = {
  status: ['reviewer', 'status'],
} as const;

export const reviewerApi = createReviewerApi(apiClient);

/**
 * True while the owner has reviewer access switched on. Only an anonymous
 * visitor can ask for it, and only when the Turnstile widget is configured,
 * so a signed-in user never gets the reviewer entry.
 */
export function useReviewerEnabled(): boolean {
  const { status } = useWebSession();
  const isTurnstileConfigured = appEnv.turnstileSiteKey !== undefined;
  const query = useQuery({
    queryKey: REVIEWER_QUERY_KEYS.status,
    queryFn: reviewerApi.isEnabled,
    enabled: isTurnstileConfigured && status === 'anonymous',
    staleTime: REVIEWER_STATUS_STALE_MS,
    retry: false,
  });
  return query.data === true;
}

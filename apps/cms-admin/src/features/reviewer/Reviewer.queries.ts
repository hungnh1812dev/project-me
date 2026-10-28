import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  API_ERROR_CODES,
  HEALTH_QUERY_RETRY,
  HTTP_STATUS,
} from '../../config/Http.constants';
import { apiFailureOf } from '../../lib/ApiFailure.errors';
import { REVIEWER_SESSIONS_PAGE_SIZE } from './Reviewer.constants';
import { useReviewerApi } from './ReviewerApi.context';

export const REVIEWER_QUERY_KEYS = {
  enabled: ['reviewer', 'enabled'],
  sessions: ['reviewer', 'sessions'],
} as const;

/** The server answers 404 REVIEWER_FEATURE_OFF while its REVIEWER_FEATURE_ENABLED switch is off. */
export function isReviewerFeatureOff(error: unknown): boolean {
  const failure = apiFailureOf(error);
  return (
    failure.kind === 'http' &&
    failure.status === HTTP_STATUS.NOT_FOUND &&
    failure.errorCode === API_ERROR_CODES.REVIEWER_FEATURE_OFF
  );
}

/** A 4xx answer is final (switch off, not allowed); only network and 5xx retry. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const failure = apiFailureOf(error);
  if (
    failure.kind === 'http' &&
    failure.status < HTTP_STATUS.SERVER_ERROR_MIN
  ) {
    return false;
  }
  return failureCount < HEALTH_QUERY_RETRY;
}

export function useReviewerEnabledQuery() {
  const api = useReviewerApi();
  return useQuery({
    queryKey: REVIEWER_QUERY_KEYS.enabled,
    queryFn: api.isEnabled,
    retry: shouldRetry,
  });
}

export function useReviewerSessionsQuery(page: number) {
  const api = useReviewerApi();
  return useQuery({
    queryKey: [...REVIEWER_QUERY_KEYS.sessions, page],
    queryFn: () => api.listSessions(page, REVIEWER_SESSIONS_PAGE_SIZE),
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

import { QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/core/api/apiError';

/** No retry for a 4xx `ApiError` (the answer won't change); at most one retry otherwise. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  });
}

/** The app's shared React Query client. Tests build their own with `makeQueryClient()`. */
export const queryClient = makeQueryClient();

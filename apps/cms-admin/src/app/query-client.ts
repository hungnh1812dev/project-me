import { QueryClient } from '@tanstack/react-query';

import { HEALTH_QUERY_RETRY } from '../config/http.constants';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: HEALTH_QUERY_RETRY } },
  });
}

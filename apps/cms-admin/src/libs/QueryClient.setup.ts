import { HEALTH_QUERY_RETRY } from '@configs/Http.constants';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: HEALTH_QUERY_RETRY } },
  });
}

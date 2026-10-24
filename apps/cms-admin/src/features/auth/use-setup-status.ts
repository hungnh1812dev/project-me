import { useQuery } from '@tanstack/react-query';

import { useSetupApi } from './setup-api-context';

/** Query key of the public setup status. */
export const SETUP_STATUS_QUERY_KEY = ['setup', 'status'] as const;

/** Whether the owner setup is open. Always fresh: setup closes within minutes. */
export function useSetupStatus() {
  const setup = useSetupApi();
  return useQuery({
    queryKey: SETUP_STATUS_QUERY_KEY,
    queryFn: setup.getSetupStatus,
    staleTime: 0,
    retry: false,
  });
}

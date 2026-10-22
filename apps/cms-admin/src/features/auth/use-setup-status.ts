import { useQuery } from '@tanstack/react-query';

import { SETUP_STATUS_QUERY_KEY } from '../../config/auth.constants';
import { useSetupApi } from './setup-api-context';

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

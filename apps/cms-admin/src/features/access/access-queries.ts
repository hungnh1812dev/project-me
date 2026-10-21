import { useQuery } from '@tanstack/react-query';

import { useAccessApi } from './access-api-context';

/** React Query keys of the access pages. */
export const ACCESS_QUERY_KEYS = {
  accounts: ['access', 'accounts'],
  roles: ['access', 'roles'],
  contentTypes: ['access', 'content-types'],
} as const;

export function useAccountsQuery() {
  const api = useAccessApi();
  return useQuery({
    queryKey: ACCESS_QUERY_KEYS.accounts,
    queryFn: api.listAccounts,
  });
}

/** Also the source of the caller's own permissions (see caller-access.ts). */
export function useRolesQuery() {
  const api = useAccessApi();
  return useQuery({
    queryKey: ACCESS_QUERY_KEYS.roles,
    queryFn: api.listRoles,
  });
}

export function useContentTypesQuery() {
  const api = useAccessApi();
  return useQuery({
    queryKey: ACCESS_QUERY_KEYS.contentTypes,
    queryFn: api.listContentTypes,
  });
}

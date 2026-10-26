import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ACCOUNTS_PAGE_SIZE, API_TOKENS_PAGE_SIZE } from './Access.constants';
import { useAccessApi } from './AccessApi.context';

/** React Query keys of the access pages. */
export const ACCESS_QUERY_KEYS = {
  accounts: ['access', 'accounts'],
  roles: ['access', 'roles'],
  apiTokens: ['access', 'api-tokens'],
  contentTypes: ['access', 'content-types'],
} as const;

/** One page of accounts; actions invalidate the `accounts` prefix (all pages). */
export function useAccountsQuery(page: number) {
  const api = useAccessApi();
  return useQuery({
    queryKey: [...ACCESS_QUERY_KEYS.accounts, page],
    queryFn: () => api.listAccounts(page, ACCOUNTS_PAGE_SIZE),
    placeholderData: keepPreviousData,
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

/** One page of API tokens; actions invalidate the `apiTokens` prefix. */
export function useApiTokensQuery(page: number) {
  const api = useAccessApi();
  return useQuery({
    queryKey: [...ACCESS_QUERY_KEYS.apiTokens, page],
    queryFn: () => api.listApiTokens(page, API_TOKENS_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
}

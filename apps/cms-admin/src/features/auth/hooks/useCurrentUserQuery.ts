import { useQuery } from '@tanstack/react-query';

import { cmsApi } from '@/core/api/CmsApi';

import type { MeUser } from '../types';

export const CURRENT_USER_QUERY_KEY = ['auth', 'me'] as const;

/**
 * The signed-in user, fresh from `GET /auth/me`. Unlike the `authApi.me` endpoint used by the
 * session thunks, this request goes through the 401 refresh, so an expired access token is
 * renewed transparently, and a session that can't be refreshed ends (back to `/login`).
 */
export function useCurrentUserQuery() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async ({ signal }) => (await cmsApi.get<MeUser>('/auth/me', { signal })).data,
  });
}

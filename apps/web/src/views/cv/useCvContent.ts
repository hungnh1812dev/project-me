import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../apis/client/Api.client';
import { BFF_ENDPOINTS } from '../../configs/Api.endpoints';
import { type CvPageData } from '../../features/cv/Cv.graphql';
import { useWebSession, type WebSession } from '../../features/session';

const ANONYMOUS_ACTOR = 'anonymous';

/** Who the data belongs to, so one actor's cache entry is never read by another. */
function actorKeyOf({ status, user }: WebSession): string {
  return status === 'authenticated' && user !== null ? `account:${user.id}` : ANONYMOUS_ACTOR;
}

/**
 * The CV data for the current visitor. Anonymous visitors (and the first paint
 * of everyone) get the server-rendered data without a request; a signed-in
 * visitor refetches through the BFF, and signing out falls back to the server
 * data. Both arrive sanitized by the server.
 */
export function useCvContent(serverData: CvPageData) {
  const actor = actorKeyOf(useWebSession());
  const isAnonymous = actor === ANONYMOUS_ACTOR;

  return useQuery({
    queryKey: ['cv', actor],
    queryFn: async () => {
      const { data } = await apiClient.get<CvPageData>(BFF_ENDPOINTS.CV);
      return data;
    },
    retry: false,
    ...(isAnonymous
      ? { initialData: serverData, staleTime: Infinity }
      : // Data read for an account is dropped as soon as nothing shows it.
        { gcTime: 0 }),
  });
}

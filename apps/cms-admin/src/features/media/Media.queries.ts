import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { MediaListFilters } from './Media.api';
import { useMediaApi } from './MediaApi.context';

export const MEDIA_QUERY_KEY = ['media', 'list'] as const;

/** One page of the library; actions invalidate the whole prefix. */
export function useMediaQuery(filters: MediaListFilters) {
  const api = useMediaApi();
  const { page, pageSize, search, mimeType } = filters;
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, page, pageSize, search, mimeType],
    queryFn: () => api.list({ page, pageSize, search, mimeType }),
    placeholderData: keepPreviousData,
  });
}

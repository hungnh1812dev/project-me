import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { MEDIA_PAGE_SIZE } from './media.constants';
import { useMediaApi } from './media-api-context';

export const MEDIA_QUERY_KEY = ['media', 'list'] as const;

/** One page of the library; actions invalidate the whole prefix. */
export function useMediaQuery(page: number) {
  const api = useMediaApi();
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, page],
    queryFn: () => api.list(page, MEDIA_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
}

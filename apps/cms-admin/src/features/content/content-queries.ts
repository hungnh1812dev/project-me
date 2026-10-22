import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { CONTENT_LIST_PAGE_SIZE } from '../../config/content.constants';
import { useContentApi } from './content-api-context';

export const CONTENT_LIST_QUERY_KEY = ['content', 'list'] as const;

/** One page of a collection (drafts for draft-and-publish types). */
export function useDocumentListQuery(
  slug: string,
  page: number,
  sort: string | undefined,
  draft: boolean,
  enabled: boolean,
) {
  const api = useContentApi();
  return useQuery({
    queryKey: [...CONTENT_LIST_QUERY_KEY, slug, { page, sort, draft }],
    queryFn: () =>
      api.list(slug, { page, pageSize: CONTENT_LIST_PAGE_SIZE, sort, draft }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

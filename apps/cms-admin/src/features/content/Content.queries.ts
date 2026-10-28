import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { CONTENT_LIST_PAGE_SIZE } from './Content.constants';
import { useContentApi } from './ContentApi.context';

/** Every content query key; pages invalidate through these, never with literals. */
export const CONTENT_QUERY_KEYS = {
  types: ['content', 'types'] as const,
  list: (slug: string) => ['content', 'list', slug] as const,
  type: (slug: string) => ['content', 'type', slug] as const,
  draft: (slug: string, documentId: string) =>
    ['content', 'draft', slug, documentId] as const,
  presence: (slug: string, documentId: string) =>
    ['content', 'presence', slug, documentId] as const,
} as const;

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
    queryKey: [...CONTENT_QUERY_KEYS.list(slug), { page, sort, draft }],
    queryFn: () =>
      api.list(slug, { page, pageSize: CONTENT_LIST_PAGE_SIZE, sort, draft }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** The content-types catalog the side menu lists. */
export function useContentTypesQuery() {
  const api = useContentApi();
  return useQuery({
    queryKey: CONTENT_QUERY_KEYS.types,
    queryFn: () => api.listContentTypes(),
  });
}

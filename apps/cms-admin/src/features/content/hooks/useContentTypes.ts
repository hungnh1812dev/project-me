import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/core/api/apiError';
import { useCan } from '@/features/auth/hooks/useCan';

import { guard } from '../access';
import { getContentType, getContentTypes, updateListFields } from '../api/contentTypesApi';
import { contentKeys } from '../queryKeys';
import type { ContentType, ContentTypeSummary } from '../types';

/**
 * C1: every content type, as summaries (the full server list; filter it with
 * `filterReadableContentTypes` for a menu). Disabled without `content_type:read`, and `decision`
 * says why.
 */
export function useContentTypes() {
  const decision = useCan('read', 'content_type');
  const query = useQuery<ContentTypeSummary[], ApiError>({
    queryKey: contentKeys.typeList(),
    queryFn: ({ signal }) => getContentTypes(signal),
    enabled: decision.allowed,
  });
  return { ...query, decision };
}

/**
 * C2: one content type with its schema and `listFields`. Disabled for an empty `slug` or without
 * `content_type:read` (`decision` says why). A 404 is an `ApiError` 404 with no retry.
 */
export function useContentType(slug: string) {
  const decision = useCan('read', 'content_type');
  const query = useQuery<ContentType, ApiError>({
    queryKey: contentKeys.type(slug),
    queryFn: ({ signal }) => getContentType(slug, signal),
    enabled: slug !== '' && decision.allowed,
  });
  return { ...query, decision };
}

/**
 * C3: replaces the list-view columns of `slug`. Needs `content_type:manager` and a non-empty list,
 * both checked before any request (`ERR_CLIENT_FORBIDDEN`, `ERR_CLIENT_VALIDATION`); whether each
 * entry is eligible is left to the server. On success, writes `type(slug)` and invalidates
 * `lists(slug)`. A failure leaves the cache untouched.
 */
export function useUpdateListFields(slug: string) {
  const queryClient = useQueryClient();
  const decision = useCan('configure', 'content_type');
  return useMutation<ContentType, ApiError, string[]>({
    mutationFn: async (listFields) => {
      guard(decision);
      if (listFields.length === 0) {
        const problem = 'listFields must not be empty.';
        throw new ApiError({
          status: 400,
          code: 'ERR_CLIENT_VALIDATION',
          message: problem,
          messages: [problem],
        });
      }
      return updateListFields(slug, listFields);
    },
    onSuccess: (contentType) => {
      queryClient.setQueryData(contentKeys.type(slug), contentType);
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(slug) });
    },
  });
}

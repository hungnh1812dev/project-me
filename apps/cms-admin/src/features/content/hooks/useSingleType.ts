import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/core/api/apiError';
import { guard } from '@/features/auth/permissions/guard';

import {
  getSingleTypeDocument,
  publishSingleType,
  saveSingleType,
  unpublishSingleType,
} from '../api/documentsApi';
import { contentKeys } from '../queryKeys';
import type { ContentTypeRef, Document, DocumentData, PublishResult } from '../types';
import { useContentTypeAccess } from './useContentTypeAccess';

/**
 * S1: the single type's document, or `null` when it was never saved (a 404, not retried). Other
 * errors propagate as `ApiError`. Disabled when `document read`, scoped to `ref.slug`, is denied.
 */
export function useSingleTypeDocument(ref: ContentTypeRef) {
  const access = useContentTypeAccess(ref);
  return useQuery<Document | null, ApiError>({
    queryKey: contentKeys.single(ref.slug),
    queryFn: ({ signal }) => getSingleTypeDocument(ref.slug, signal),
    enabled: access.read.allowed,
  });
}

/**
 * S2: saves the single type's `data` (`PUT { data }`). Needs scoped `update`, checked before any
 * request. On success, writes the document into `single(slug)`.
 */
export function useSaveSingleType(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<Document, ApiError, DocumentData>({
    mutationFn: async (data) => {
      guard(access.update);
      return saveSingleType(ref.slug, data);
    },
    onSuccess: (doc) => {
      queryClient.setQueryData(contentKeys.single(ref.slug), doc);
    },
  });
}

/**
 * S3: publishes the single type. Denied before any request without scoped `publish` or when
 * `ref.draftToPublish` is false. On success, invalidates `single(slug)`.
 */
export function usePublishSingleType(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<PublishResult, ApiError, void>({
    mutationFn: async () => {
      guard(access.publish);
      return publishSingleType(ref.slug);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contentKeys.single(ref.slug) }),
  });
}

/**
 * S4: unpublishes the single type. Denied before any request without scoped `unpublish` or when
 * `ref.draftToPublish` is false. On success, invalidates `single(slug)`.
 */
export function useUnpublishSingleType(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<PublishResult, ApiError, void>({
    mutationFn: async () => {
      guard(access.unpublish);
      return unpublishSingleType(ref.slug);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contentKeys.single(ref.slug) }),
  });
}

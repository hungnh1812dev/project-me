import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ApiError } from '@/core/api/apiError';

import { getDocument, listDocuments } from '../api/documentsApi';
import { contentKeys } from '../queryKeys';
import type { ContentTypeRef, Document, ListDocumentsResponse, ListParams } from '../types';
import { useContentTypeAccess } from './useContentTypeAccess';

/**
 * D1: one page of `ref.slug`'s documents, cached under `list(slug, normalize(params))`, so equal
 * params share one entry and one request. The previous page stays visible while the next one loads
 * (`isPlaceholderData`). Invalid params fail with `ERR_CLIENT_VALIDATION` and send nothing.
 * Disabled when `document read`, scoped to `ref.slug`, is denied.
 */
export function useDocumentList(ref: ContentTypeRef, params: ListParams) {
  const access = useContentTypeAccess(ref);
  return useQuery<ListDocumentsResponse, ApiError>({
    queryKey: contentKeys.list(ref.slug, params),
    queryFn: ({ signal }) => listDocuments(ref.slug, params, signal),
    placeholderData: keepPreviousData,
    enabled: access.read.allowed,
  });
}

/**
 * D3: one document, unwrapped from `{ data }`, cached under `detail(slug, documentId)`. Disabled for
 * an empty `documentId` or when scoped read is denied. A 404 is an `ApiError` 404 with no retry.
 */
export function useDocument(ref: ContentTypeRef, documentId: string) {
  const access = useContentTypeAccess(ref);
  return useQuery<Document, ApiError>({
    queryKey: contentKeys.detail(ref.slug, documentId),
    queryFn: ({ signal }) => getDocument(ref.slug, documentId, signal),
    enabled: documentId !== '' && access.read.allowed,
  });
}

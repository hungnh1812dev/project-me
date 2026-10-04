import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/core/api/apiError';
import { guard } from '@/features/auth/permissions/guard';

import {
  bulkCreateDocuments,
  bulkDeleteDocuments,
  createDocument,
  deleteDocument,
  duplicateDocument,
  publishDocument,
  unpublishDocument,
  updateDocument,
} from '../api/documentsApi';
import { contentKeys } from '../queryKeys';
import type {
  BulkDeleteResult,
  ContentTypeRef,
  Document,
  DocumentData,
  PublishResult,
} from '../types';
import { useContentTypeAccess } from './useContentTypeAccess';

// Each hook follows its row of the SPEC cache-invalidation matrix. The ABAC guard runs first in
// every `mutationFn`, so a denied mutation rejects with `ERR_CLIENT_FORBIDDEN`, sends no request
// and touches no cache entry. There are no optimistic updates: a failure leaves the cache as it was.

/** The bulk routes (D9, D10) accept 1 to 100 entries. */
const BULK_MAX = 100;

/** Rejects a bulk payload outside 1–100 entries with `ERR_CLIENT_VALIDATION`, before any request. */
function assertBulkSize(field: string, count: number): void {
  if (count >= 1 && count <= BULK_MAX) return;
  const problem = `${field} must contain between 1 and ${BULK_MAX} entries.`;
  throw new ApiError({
    status: 400,
    code: 'ERR_CLIENT_VALIDATION',
    message: problem,
    messages: [problem],
  });
}

/**
 * D2: creates a draft from `data` (variables: `DocumentData`). Needs scoped `create`. On success,
 * seeds `detail(slug, created.documentId)` and invalidates `lists(slug)`.
 */
export function useCreateDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<Document, ApiError, DocumentData>({
    mutationFn: async (data) => {
      guard(access.create);
      return createDocument(ref.slug, data);
    },
    onSuccess: (doc) => {
      queryClient.setQueryData(contentKeys.detail(ref.slug, doc.documentId), doc);
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

/**
 * D4: replaces a document's `data` (variables: `{ documentId, data }`). Needs scoped `update`. On
 * success, writes `detail(slug, id)` and invalidates `lists(slug)`.
 */
export function useUpdateDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<Document, ApiError, { documentId: string; data: DocumentData }>({
    mutationFn: async ({ documentId, data }) => {
      guard(access.update);
      return updateDocument(ref.slug, documentId, data);
    },
    onSuccess: (doc) => {
      queryClient.setQueryData(contentKeys.detail(ref.slug, doc.documentId), doc);
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

/**
 * D5: deletes a document (variables: its `documentId`). Needs scoped `delete`. On success, removes
 * `detail(slug, id)` and invalidates `lists(slug)`.
 */
export function useDeleteDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<void, ApiError, string>({
    mutationFn: async (documentId) => {
      guard(access.delete);
      return deleteDocument(ref.slug, documentId);
    },
    onSuccess: (_void, documentId) => {
      queryClient.removeQueries({
        queryKey: contentKeys.detail(ref.slug, documentId),
        exact: true,
      });
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

/**
 * D8: copies a document into a new draft (variables: the source `documentId`) and resolves with
 * that draft. Needs scoped `create`. On success, seeds `detail(slug, copy.documentId)` and
 * invalidates `lists(slug)`.
 */
export function useDuplicateDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<Document, ApiError, string>({
    mutationFn: async (documentId) => {
      guard(access.create);
      return duplicateDocument(ref.slug, documentId);
    },
    onSuccess: (copy) => {
      queryClient.setQueryData(contentKeys.detail(ref.slug, copy.documentId), copy);
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

/**
 * D6: publishes a document (variables: its `documentId`). Denied before any request without scoped
 * `publish` or when `ref.draftToPublish` is false. On success, invalidates `detail(slug, id)` and
 * `lists(slug)`.
 */
export function usePublishDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<PublishResult, ApiError, string>({
    mutationFn: async (documentId) => {
      guard(access.publish);
      return publishDocument(ref.slug, documentId);
    },
    onSuccess: (_result, documentId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: contentKeys.detail(ref.slug, documentId) }),
        queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) }),
      ]),
  });
}

/**
 * D7: unpublishes a document (variables: its `documentId`). Denied before any request without
 * scoped `unpublish` or when `ref.draftToPublish` is false. On success, invalidates
 * `detail(slug, id)` and `lists(slug)`.
 */
export function useUnpublishDocument(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<PublishResult, ApiError, string>({
    mutationFn: async (documentId) => {
      guard(access.unpublish);
      return unpublishDocument(ref.slug, documentId);
    },
    onSuccess: (_result, documentId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: contentKeys.detail(ref.slug, documentId) }),
        queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) }),
      ]),
  });
}

/**
 * D9: creates and publishes 1–100 documents at once, all or nothing (variables: one
 * `DocumentData` per item). Needs scoped `create` and `publish`, and is denied when
 * `ref.draftToPublish` is false. A size outside 1–100 rejects with `ERR_CLIENT_VALIDATION`. On
 * success, seeds one `detail` per created document and invalidates `lists(slug)`. A 400 (the server
 * rolled back) passes through unchanged and leaves the cache untouched.
 */
export function useBulkCreateDocuments(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<Document[], ApiError, DocumentData[]>({
    mutationFn: async (items) => {
      guard(access.bulkCreate);
      assertBulkSize('items', items.length);
      return bulkCreateDocuments(ref.slug, items);
    },
    onSuccess: (docs) => {
      for (const doc of docs) {
        queryClient.setQueryData(contentKeys.detail(ref.slug, doc.documentId), doc);
      }
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

/**
 * D10: deletes up to 100 documents (variables: their `documentId`s; duplicates are dropped before
 * the 1–100 check). Needs scoped `delete`. Partial success: resolves with the backend's
 * `{ deleted, failed }` unchanged, removes `detail` only for the `deleted` ids, and invalidates
 * `lists(slug)` even when some ids failed.
 */
export function useBulkDeleteDocuments(ref: ContentTypeRef) {
  const queryClient = useQueryClient();
  const access = useContentTypeAccess(ref);
  return useMutation<BulkDeleteResult, ApiError, string[]>({
    mutationFn: async (documentIds) => {
      guard(access.bulkDelete);
      const unique = [...new Set(documentIds)];
      assertBulkSize('documentIds', unique.length);
      return bulkDeleteDocuments(ref.slug, unique);
    },
    onSuccess: (result) => {
      for (const documentId of result.deleted) {
        queryClient.removeQueries({
          queryKey: contentKeys.detail(ref.slug, documentId),
          exact: true,
        });
      }
      return queryClient.invalidateQueries({ queryKey: contentKeys.lists(ref.slug) });
    },
  });
}

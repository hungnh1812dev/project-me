import { isApiError } from '@/core/api/apiError';
import { cmsApi } from '@/core/api/CmsApi';

import {
  listValidationError,
  normalizeListParams,
  toListSearchParams,
  validateListParams,
} from '../listQuery';
import type {
  BulkCreateResponse,
  BulkDeleteResult,
  Document,
  DocumentData,
  DocumentEnvelope,
  ListDocumentsResponse,
  ListParams,
  PublishResult,
} from '../types';

// Pure request functions for the document endpoints (SPEC S1–S4, D1–D10). Every path segment built
// from a slug or a documentId is encoded (AC-6), and `{ data }` envelopes are unwrapped. Errors
// reject as the `ApiError` the `cmsApi` interceptor built, except the single-type 404 (→ `null`).

const singlePath = (slug: string) => `/documents/single-type/${encodeURIComponent(slug)}`;
const collectionPath = (slug: string) => `/documents/collection-type/${encodeURIComponent(slug)}`;
const documentPath = (slug: string, documentId: string) =>
  `${collectionPath(slug)}/${encodeURIComponent(documentId)}`;

/** S1 `GET /documents/single-type/:slug`. Resolves `null` on a 404: the single type was never saved. */
export async function getSingleTypeDocument(
  slug: string,
  signal?: AbortSignal,
): Promise<Document | null> {
  try {
    const { data } = await cmsApi.get<DocumentEnvelope>(singlePath(slug), { signal });
    return data.data;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** S2 `PUT /documents/single-type/:slug`: creates or updates the single type's document. */
export async function saveSingleType(
  slug: string,
  data: DocumentData,
  signal?: AbortSignal,
): Promise<Document> {
  const res = await cmsApi.put<DocumentEnvelope>(singlePath(slug), { data }, { signal });
  return res.data.data;
}

/** S3 `POST /documents/single-type/:slug/publish`. */
export async function publishSingleType(
  slug: string,
  signal?: AbortSignal,
): Promise<PublishResult> {
  const { data } = await cmsApi.post<PublishResult>(`${singlePath(slug)}/publish`, undefined, {
    signal,
  });
  return data;
}

/** S4 `POST /documents/single-type/:slug/unpublish`. */
export async function unpublishSingleType(
  slug: string,
  signal?: AbortSignal,
): Promise<PublishResult> {
  const { data } = await cmsApi.post<PublishResult>(`${singlePath(slug)}/unpublish`, undefined, {
    signal,
  });
  return data;
}

/**
 * D1 `GET /documents/collection-type/:slug`. Validates `params` first: invalid params reject with
 * `ERR_CLIENT_VALIDATION` and send no request (AC-5). Otherwise sends the normalized params,
 * serialized by `toListSearchParams` (AC-3, AC-4), not by axios.
 */
export async function listDocuments(
  slug: string,
  params: ListParams,
  signal?: AbortSignal,
): Promise<ListDocumentsResponse> {
  const problems = validateListParams(params);
  if (problems.length > 0) throw listValidationError(problems);
  const { data } = await cmsApi.get<ListDocumentsResponse>(collectionPath(slug), {
    params: toListSearchParams(normalizeListParams(params)),
    signal,
  });
  return data;
}

/** D3 `GET …/:slug/:documentId`. */
export async function getDocument(
  slug: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<Document> {
  const { data } = await cmsApi.get<DocumentEnvelope>(documentPath(slug, documentId), { signal });
  return data.data;
}

/** D2 `POST /documents/collection-type/:slug`: creates a draft. */
export async function createDocument(
  slug: string,
  data: DocumentData,
  signal?: AbortSignal,
): Promise<Document> {
  const res = await cmsApi.post<DocumentEnvelope>(collectionPath(slug), { data }, { signal });
  return res.data.data;
}

/** D4 `PUT …/:slug/:documentId`. */
export async function updateDocument(
  slug: string,
  documentId: string,
  data: DocumentData,
  signal?: AbortSignal,
): Promise<Document> {
  const res = await cmsApi.put<DocumentEnvelope>(
    documentPath(slug, documentId),
    { data },
    { signal },
  );
  return res.data.data;
}

/** D5 `DELETE …/:slug/:documentId` (204). */
export async function deleteDocument(
  slug: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<void> {
  await cmsApi.delete(documentPath(slug, documentId), { signal });
}

/** D8 `POST …/:slug/:documentId/duplicate`: resolves with the new draft copy. */
export async function duplicateDocument(
  slug: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<Document> {
  const res = await cmsApi.post<DocumentEnvelope>(
    `${documentPath(slug, documentId)}/duplicate`,
    undefined,
    { signal },
  );
  return res.data.data;
}

/** D6 `POST …/:slug/:documentId/publish`. */
export async function publishDocument(
  slug: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<PublishResult> {
  const { data } = await cmsApi.post<PublishResult>(
    `${documentPath(slug, documentId)}/publish`,
    undefined,
    { signal },
  );
  return data;
}

/** D7 `POST …/:slug/:documentId/unpublish`. */
export async function unpublishDocument(
  slug: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<PublishResult> {
  const { data } = await cmsApi.post<PublishResult>(
    `${documentPath(slug, documentId)}/unpublish`,
    undefined,
    { signal },
  );
  return data;
}

/**
 * D9 `POST …/:slug/bulk`: creates and publishes every item, all or nothing. Sends
 * `{ items: { data }[] }` and resolves with the unwrapped documents. The 1–100 size rule is
 * enforced by the hook, not here.
 */
export async function bulkCreateDocuments(
  slug: string,
  items: DocumentData[],
  signal?: AbortSignal,
): Promise<Document[]> {
  const res = await cmsApi.post<BulkCreateResponse>(
    `${collectionPath(slug)}/bulk`,
    { items: items.map((data) => ({ data })) },
    { signal },
  );
  return res.data.items.map((item) => item.data);
}

/**
 * D10 `DELETE …/:slug/bulk` with a `{ documentIds }` JSON body. Partial success: resolves with the
 * backend's `{ deleted, failed }` unchanged. The 1–100 size rule is enforced by the hook, not here.
 */
export async function bulkDeleteDocuments(
  slug: string,
  documentIds: string[],
  signal?: AbortSignal,
): Promise<BulkDeleteResult> {
  const { data } = await cmsApi.delete<BulkDeleteResult>(`${collectionPath(slug)}/bulk`, {
    data: { documentIds },
    signal,
  });
  return data;
}

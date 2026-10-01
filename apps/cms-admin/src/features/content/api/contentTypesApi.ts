import { cmsApi } from '@/core/api/CmsApi';

import type { ContentType, ContentTypeSummary } from '../types';

// Pure request functions for the content-type endpoints (SPEC C1–C3). Every path segment built
// from a slug is encoded (AC-6). Errors reject as the `ApiError` the `cmsApi` interceptor built.

const typePath = (slug: string) => `/content-types/${encodeURIComponent(slug)}`;

/** C1 `GET /content-types`: every content type, as summaries. */
export async function getContentTypes(signal?: AbortSignal): Promise<ContentTypeSummary[]> {
  const { data } = await cmsApi.get<ContentTypeSummary[]>('/content-types', { signal });
  return data;
}

/** C2 `GET /content-types/:slug`: one content type with its schema and `listFields`. */
export async function getContentType(slug: string, signal?: AbortSignal): Promise<ContentType> {
  const { data } = await cmsApi.get<ContentType>(typePath(slug), { signal });
  return data;
}

/** C3 `PATCH /content-types/:slug/list-fields`: replaces the list-view columns. */
export async function updateListFields(
  slug: string,
  listFields: string[],
  signal?: AbortSignal,
): Promise<ContentType> {
  const { data } = await cmsApi.patch<ContentType>(
    `${typePath(slug)}/list-fields`,
    { listFields },
    { signal },
  );
  return data;
}

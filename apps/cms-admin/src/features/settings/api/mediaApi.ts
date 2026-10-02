import { cmsApi } from '@/core/api/CmsApi';

import type { MediaAsset } from '../types';

// Pure request functions for the media endpoints (SPEC M1–M3). Every id in a path is encoded.
// Errors reject as the `ApiError` the `cmsApi` interceptor built.

/** M1 `GET /media`: every asset, newest first. */
export async function getMedia(signal?: AbortSignal): Promise<MediaAsset[]> {
  const { data } = await cmsApi.get<MediaAsset[]>('/media', { signal });
  return data;
}

/**
 * M2 `POST /media/upload`: one file as the multipart field `file` (AC-37). The per-request
 * `multipart/form-data` only overrides `cmsApi`'s JSON default, which would serialize the
 * `FormData` to JSON; axios then drops it so the browser sets the header with its boundary.
 */
export async function uploadMedia(file: File): Promise<MediaAsset> {
  const body = new FormData();
  body.append('file', file);
  const { data } = await cmsApi.post<MediaAsset>('/media/upload', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** M3 `DELETE /media/:id`: deletes it (204), 404 when it is gone. */
export async function deleteMedia(id: string): Promise<void> {
  await cmsApi.delete(`/media/${encodeURIComponent(id)}`);
}

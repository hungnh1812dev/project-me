import type { PageMeta } from '@apis/client/Api.client';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import type { AxiosInstance } from 'axios';

import { MEDIA_UPLOAD_TIMEOUT_MS } from './Media.constants';

/** A library file as `GET /media` returns it. */
export interface MediaFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
  thumbnailUrl: string | null;
  isReviewerPreset: boolean;
  createdAt: string;
  updatedAt: string;
  /** Hex digest of the stored bytes. */
  sha256: string;
  /** Storage provider; sent once the API exposes it (attach contract). */
  provider?: string;
}

/** Filters of `GET /media`; empty `search` and `mimeType` are not sent. */
export interface MediaListFilters {
  page: number;
  pageSize: number;
  search: string;
  /** Exact type, or a family such as `image/*`. */
  mimeType: string;
}

export interface MediaPage {
  data: MediaFile[];
  meta: PageMeta;
}

export interface UploadOptions {
  alt?: string;
  onProgress?: (sentBytes: number, totalBytes: number | undefined) => void;
  signal?: AbortSignal;
}

const FILE_FIELD = 'file';
const ALT_FIELD = 'alt';

/** Media library calls. Bearer via the interceptor. */
export function createMediaApi(client: AxiosInstance) {
  const { MEDIA } = API_ENDPOINTS;
  return {
    list: async (filters: MediaListFilters): Promise<MediaPage> => {
      const { page, pageSize, search, mimeType } = filters;
      const { data } = await client.get<MediaPage>(MEDIA.LIST, {
        params: {
          page,
          pageSize,
          ...(search === '' ? {} : { search }),
          ...(mimeType === '' ? {} : { mimeType }),
        },
      });
      return data;
    },

    upload: async (file: File, options: UploadOptions = {}): Promise<MediaFile> => {
      const { alt, onProgress, signal } = options;
      const body = new FormData();
      if (alt !== undefined && alt !== '') body.append(ALT_FIELD, alt);
      body.append(FILE_FIELD, file);
      const { data } = await client.post<MediaFile>(MEDIA.LIST, body, {
        timeout: MEDIA_UPLOAD_TIMEOUT_MS,
        shouldRefreshExpiringToken: true,
        ...(signal ? { signal } : {}),
        ...(onProgress
          ? { onUploadProgress: (event) => onProgress(event.loaded, event.total) }
          : {}),
      });
      return data;
    },

    /** Swaps the bytes of a file and keeps its id; 400 when the type family differs. */
    replaceFile: async (
      id: string,
      file: File,
      options: Omit<UploadOptions, 'alt'> = {},
    ): Promise<MediaFile> => {
      const { onProgress, signal } = options;
      const body = new FormData();
      body.append(FILE_FIELD, file);
      const { data } = await client.put<MediaFile>(MEDIA.FILE(id), body, {
        timeout: MEDIA_UPLOAD_TIMEOUT_MS,
        shouldRefreshExpiringToken: true,
        ...(signal ? { signal } : {}),
        ...(onProgress
          ? { onUploadProgress: (event) => onProgress(event.loaded, event.total) }
          : {}),
      });
      return data;
    },

    /** `null` or blank clears the alt text. */
    updateAlt: async (id: string, alt: string | null): Promise<MediaFile> => {
      const { data } = await client.patch<MediaFile>(MEDIA.ONE(id), { alt });
      return data;
    },

    /** 204; 409 `MEDIA_IN_USE` while a document references the file. */
    remove: async (id: string): Promise<void> => {
      await client.delete(MEDIA.ONE(id));
    },
  };
}

export type MediaApi = ReturnType<typeof createMediaApi>;

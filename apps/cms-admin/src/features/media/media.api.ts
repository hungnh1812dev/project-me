import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';
import type { PageMeta } from '../../lib/api-types';

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
  /** Storage provider; sent once the API exposes it (T29 attach contract). */
  provider?: string;
}

export interface MediaPage {
  data: MediaFile[];
  meta: PageMeta;
}

const FILE_FIELD = 'file';
const ALT_FIELD = 'alt';

/** Media library calls (T27-T29). Bearer via the interceptor. */
export function createMediaApi(client: AxiosInstance) {
  const { MEDIA } = API_ENDPOINTS;
  return {
    list: async (page: number, pageSize: number): Promise<MediaPage> => {
      const { data } = await client.get<MediaPage>(MEDIA.LIST, {
        params: { page, pageSize },
      });
      return data;
    },

    upload: async (file: File, alt?: string): Promise<MediaFile> => {
      const body = new FormData();
      if (alt !== undefined && alt !== '') body.append(ALT_FIELD, alt);
      body.append(FILE_FIELD, file);
      const { data } = await client.post<MediaFile>(MEDIA.LIST, body);
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

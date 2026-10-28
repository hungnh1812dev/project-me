import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/Api.endpoints';

const { BACKUPS } = API_ENDPOINTS;

/** One row of `GET /backups`. Times are UTC ISO strings parsed from the file name. */
export interface BackupFile {
  /** The object key; the only value sent back to ask for a link. */
  key: string;
  kind: 'daily' | 'monthly';
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupsList {
  data: BackupFile[];
  meta: {
    count: number;
    totalBytes: number;
    latestAt: string | null;
    /** No daily backup newer than 26 hours. */
    isStale: boolean;
  };
}

export interface DownloadLinkInput {
  key: string;
  password: string;
  code: string;
}

/** A bearer URL that works for about a minute: use it once, never store it. */
export interface DownloadLink {
  url: string;
  fileName: string;
  expiresAt: string;
}

export function createBackupsApi(client: AxiosInstance) {
  return {
    list: async (): Promise<BackupsList> => {
      const { data } = await client.get<BackupsList>(BACKUPS.LIST);
      return data;
    },

    createDownloadLink: async (
      input: DownloadLinkInput,
    ): Promise<DownloadLink> => {
      const { data } = await client.post<DownloadLink>(
        BACKUPS.DOWNLOAD_LINKS,
        input,
      );
      return data;
    },
  };
}

export type BackupsApi = ReturnType<typeof createBackupsApi>;

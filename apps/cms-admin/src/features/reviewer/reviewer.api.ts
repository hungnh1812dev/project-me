import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';
import type { PageMeta } from '../../lib/api-types';

const { REVIEWER } = API_ENDPOINTS;

/** One row of `GET /reviewer/sessions`. The visitor's IP is never returned. */
export interface ReviewerSession {
  /** The ephemeral reviewer account's document id. */
  id: string;
  visitorRole: string;
  purposeTags: string[];
  /** Free text from a visitor: render as text only. */
  notes: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

export interface ReviewerSessionsPage {
  data: ReviewerSession[];
  meta: PageMeta;
}

export function createReviewerApi(client: AxiosInstance) {
  return {
    isEnabled: async (): Promise<boolean> => {
      const { data } = await client.get<{ enabled: boolean }>(REVIEWER.STATUS);
      return data.enabled === true;
    },

    /** Switching off also ends every live reviewer session (T31). */
    setEnabled: async (enabled: boolean): Promise<boolean> => {
      const { data } = await client.put<{ enabled: boolean }>(
        REVIEWER.SETTINGS,
        { enabled },
      );
      return data.enabled === true;
    },

    listSessions: async (
      page: number,
      pageSize: number,
    ): Promise<ReviewerSessionsPage> => {
      const { data } = await client.get<ReviewerSessionsPage>(
        REVIEWER.SESSIONS,
        { params: { page, pageSize } },
      );
      return data;
    },
  };
}

export type ReviewerApi = ReturnType<typeof createReviewerApi>;

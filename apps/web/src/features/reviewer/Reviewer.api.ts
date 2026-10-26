import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/Api.endpoints';

/** What the visitor tells the owner when asking for review access (no PII). */
export interface ReviewerSessionInput {
  visitorRole: string;
  purposeTags: string[];
  /** Plain text, optional. */
  notes?: string;
  turnstileToken: string;
}

export interface ReviewerSessionResult {
  accessToken: string;
  expiresAt: string;
}

/**
 * Reviewer calls, made from the browser to cms-api (D14). The reviewer token
 * is returned to the browser only; the Next server never sees it.
 */
export function createReviewerApi(client: AxiosInstance) {
  return {
    /** The owner's on/off switch. Public. */
    isEnabled: async (): Promise<boolean> => {
      const { data } = await client.get<{ enabled: boolean }>(
        API_ENDPOINTS.REVIEWER.STATUS,
      );
      return data.enabled === true;
    },

    createSession: async (
      input: ReviewerSessionInput,
    ): Promise<ReviewerSessionResult> => {
      const { data } = await client.post<ReviewerSessionResult>(
        API_ENDPOINTS.REVIEWER.SESSIONS,
        input,
      );
      return data;
    },
  };
}

export type ReviewerApi = ReturnType<typeof createReviewerApi>;

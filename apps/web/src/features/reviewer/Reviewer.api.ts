import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { HTTP_STATUS } from '../../config/Http.constants';
import { REVIEWER_ERROR_CODES } from '../../config/Reviewer.constants';
import { apiFailureOf } from '../../lib/ApiFailure.errors';

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

function isFeatureOff(cause: unknown): boolean {
  const failure = apiFailureOf(cause);
  return (
    failure.kind === 'http' &&
    failure.status === HTTP_STATUS.NOT_FOUND &&
    failure.errorCode === REVIEWER_ERROR_CODES.FEATURE_OFF
  );
}

/**
 * Reviewer calls, made from the browser to cms-api (D14). The reviewer token
 * is returned to the browser only; the Next server never sees it.
 */
export function createReviewerApi(client: AxiosInstance) {
  return {
    /**
     * The owner's on/off switch. Public. A server with the deploy switch off
     * answers `REVIEWER_FEATURE_OFF`, which reads as "not enabled".
     */
    isEnabled: async (): Promise<boolean> => {
      try {
        const { data } = await client.get<{ enabled: boolean }>(
          API_ENDPOINTS.REVIEWER.STATUS,
        );
        return data.enabled === true;
      } catch (cause) {
        if (isFeatureOff(cause)) return false;
        throw cause;
      }
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

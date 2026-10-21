import { isAxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/http.constants';
import { apiFailureOf, rateLimitedMessage } from '../auth/api-failure';
import type { FormAlertTone } from '../auth/FormAlert';

const copy = COPY.content.errors;

export interface SaveError {
  message: string;
  tone: FormAlertTone;
  /** A stale version: the page offers "Reload latest version". */
  conflict: boolean;
}

function serverMessage(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const message = (error.response?.data as { message?: unknown } | null)
    ?.message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}

/** A failed create / update, reduced to the alert the form shows. */
export function toSaveError(error: unknown): SaveError {
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        conflict: false,
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', conflict: false, message: copy.network };
    case 'unexpected':
      return { tone: 'error', conflict: false, message: copy.unexpected };
    case 'http': {
      if (failure.errorCode === API_ERROR_CODES.DOCUMENT_VERSION_CONFLICT) {
        return { tone: 'warning', conflict: true, message: copy.conflict };
      }
      if (failure.status === HTTP_STATUS.FORBIDDEN) {
        return { tone: 'error', conflict: false, message: copy.forbidden };
      }
      if (failure.errorCode === API_ERROR_CODES.DOCUMENT_INVALID) {
        const detail = serverMessage(error);
        return {
          tone: 'error',
          conflict: false,
          message:
            detail === undefined ? copy.invalidFallback : copy.invalid(detail),
        };
      }
      return { tone: 'error', conflict: false, message: copy.unexpected };
    }
  }
}

/** Load failures that mean "not found or not readable" rather than "try again". */
export function isMissing(error: unknown): boolean {
  const failure = apiFailureOf(error);
  return (
    failure.kind === 'http' &&
    (failure.status === HTTP_STATUS.NOT_FOUND ||
      failure.status === HTTP_STATUS.FORBIDDEN)
  );
}

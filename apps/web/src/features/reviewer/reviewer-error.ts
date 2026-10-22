import { COPY } from '../../config/copy.constants';
import {
  HTTP_STATUS,
  REVIEWER_ERROR_CODES,
  SECONDS_PER_MINUTE,
} from '../../config/http.constants';
import type { ApiFailure, LoginAlert } from '../auth/api-failure';

const copy = COPY.reviewer.errors;

function ipLimitedMessage(seconds: number | undefined): string {
  if (seconds === undefined) return copy.ipLimited;
  if (seconds < SECONDS_PER_MINUTE) return copy.ipLimitedSeconds(seconds);
  return copy.ipLimitedMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

export interface ReviewerAlert extends LoginAlert {
  /** The Turnstile token was spent or rejected: ask for a new challenge. */
  resetChallenge: boolean;
}

/** A failed `POST /reviewer/sessions` -> the alert above the dialog's form. */
export function reviewerAlertOf(failure: ApiFailure): ReviewerAlert {
  const warn = (message: string, resetChallenge = true): ReviewerAlert => ({
    tone: 'warning',
    message,
    resetChallenge,
  });
  const fail = (message: string): ReviewerAlert => ({
    tone: 'error',
    message,
    resetChallenge: true,
  });
  switch (failure.kind) {
    case 'rate-limited':
      return warn(ipLimitedMessage(failure.retryAfterSeconds));
    case 'network':
      return warn(copy.network);
    case 'privileged':
    case 'unexpected':
      return fail(copy.unexpected);
    case 'http':
      switch (failure.errorCode) {
        case REVIEWER_ERROR_CODES.DISABLED:
          return warn(copy.disabled, false);
        case REVIEWER_ERROR_CODES.UNAVAILABLE:
          return warn(copy.unavailable);
        case REVIEWER_ERROR_CODES.TURNSTILE_FAILED:
          return warn(copy.turnstileFailed);
        case REVIEWER_ERROR_CODES.IP_LIMITED:
          return warn(copy.ipLimited);
        case REVIEWER_ERROR_CODES.CAPACITY_REACHED:
          return warn(copy.capacity);
        default:
          return failure.status === HTTP_STATUS.BAD_REQUEST
            ? fail(copy.invalid)
            : fail(copy.unexpected);
      }
  }
}

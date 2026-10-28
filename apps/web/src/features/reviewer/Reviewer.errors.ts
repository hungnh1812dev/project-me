import { COPY } from '../../config/Copy.constants';
import { HTTP_STATUS } from '../../config/Http.constants';
import { REVIEWER_ERROR_CODES } from '../../config/Reviewer.constants';
import {
  type Alert,
  type ApiFailure,
  formatRetryAfter,
} from '../../lib/ApiFailure.errors';

const copy = COPY.reviewer.errors;

function ipLimitedMessage(seconds: number | undefined): string {
  return formatRetryAfter(seconds, {
    waitUnknown: copy.ipLimited,
    inSeconds: copy.ipLimitedSeconds,
    inMinutes: copy.ipLimitedMinutes,
  });
}

export interface ReviewerAlert extends Alert {
  /** The Turnstile token was spent or rejected: ask for a new challenge. */
  shouldResetChallenge: boolean;
}

/** A failed `POST /reviewer/sessions` -> the alert above the dialog's form. */
export function reviewerAlertOf(failure: ApiFailure): ReviewerAlert {
  const warn = (
    message: string,
    shouldResetChallenge = true,
  ): ReviewerAlert => ({
    tone: 'warning',
    message,
    shouldResetChallenge,
  });
  const fail = (message: string): ReviewerAlert => ({
    tone: 'error',
    message,
    shouldResetChallenge: true,
  });
  switch (failure.kind) {
    case 'rate-limited':
      return warn(ipLimitedMessage(failure.retryAfterSeconds));
    case 'network':
      return warn(copy.network);
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

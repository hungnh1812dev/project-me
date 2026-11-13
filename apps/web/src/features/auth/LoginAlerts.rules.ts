import {
  formatRetryAfter,
  isRateLimitError,
  webApiErrorOf,
  type Alert,
} from '@/apis/client/ClientApi.errors';
import { API_ERROR_CODES, type WebApiError } from '@/apis/WebApi.errors';
import type { SignInText } from '@/features/site-shell';
import { formatText, pickPlural } from '@/utils/TextTemplate.rules';

import { PrivilegedAccessError } from '../session';

export type SignInErrorText = SignInText['errors'];

export function rateLimitedMessage(seconds: number | undefined, errors: SignInErrorText): string {
  return formatRetryAfter(seconds, {
    waitUnknown: errors.rateLimited,
    inSeconds: (count) =>
      formatText(
        pickPlural(count, {
          one: errors.rateLimitedSecondsOne,
          other: errors.rateLimitedSecondsOther,
        }),
        { count },
      ),
    inMinutes: (count) =>
      formatText(
        pickPlural(count, {
          one: errors.rateLimitedMinutesOne,
          other: errors.rateLimitedMinutesOther,
        }),
        { count },
      ),
  });
}

/**
 * Any sign-in step's error -> its alert. A privileged account is checked
 * first, for both steps, so it never reads as a transport failure.
 */
export function loginErrorAlertOf<T>(
  error: unknown,
  errors: SignInErrorText,
  alertOfFailure: (failure: WebApiError) => T,
): Alert | T {
  if (error instanceof PrivilegedAccessError) {
    return { tone: 'warning', message: errors.privileged };
  }
  return alertOfFailure(webApiErrorOf(error));
}

/**
 * The failures every sign-in step shares: transport, rate limit, human check
 * and a privileged account. Null = the step maps its own codes.
 */
export function sharedFailureAlertOf(failure: WebApiError, errors: SignInErrorText): Alert | null {
  if (isRateLimitError(failure)) {
    return { tone: 'warning', message: rateLimitedMessage(failure.retryAfterSeconds, errors) };
  }
  switch (failure.errorCode) {
    case API_ERROR_CODES.CLIENT.NETWORK:
      return { tone: 'warning', message: errors.network };
    case API_ERROR_CODES.CLIENT.UNEXPECTED:
      return { tone: 'error', message: errors.unexpected };
    case API_ERROR_CODES.BFF.HUMAN_CHECK_FAILED:
      return { tone: 'error', message: errors.humanCheckFailed };
    case API_ERROR_CODES.BFF.HUMAN_CHECK_UNAVAILABLE:
      return { tone: 'warning', message: errors.humanCheckUnavailable };
    case API_ERROR_CODES.BFF.PRIVILEGED_ACCOUNT:
      return { tone: 'warning', message: errors.privileged };
    default:
      return null;
  }
}

/**
 * Credential step failure -> one generic alert: a wrong email and a wrong
 * password read the same, so the UI never tells which part was wrong or
 * whether the account exists.
 */
export function credentialAlertOf(failure: WebApiError, errors: SignInErrorText): Alert {
  const shared = sharedFailureAlertOf(failure, errors);
  if (shared !== null) return shared;
  return failure.errorCode === API_ERROR_CODES.BFF.INVALID_CREDENTIALS
    ? { tone: 'error', message: errors.invalidCredentials }
    : { tone: 'error', message: errors.unexpected };
}

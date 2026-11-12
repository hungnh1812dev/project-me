import {
  apiFailureOf,
  formatRetryAfter,
  type Alert,
  type ApiFailure,
} from '@/apis/client/ApiFailure.errors';
import { BFF_ERROR_CODES } from '@/configs/Auth.constants';
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
  alertOfFailure: (failure: ApiFailure) => T,
): Alert | T {
  if (error instanceof PrivilegedAccessError) {
    return { tone: 'warning', message: errors.privileged };
  }
  return alertOfFailure(apiFailureOf(error));
}

/**
 * The failures every sign-in step shares: transport, rate limit, human check
 * and a privileged account. Null = the step maps its own codes.
 */
export function sharedFailureAlertOf(failure: ApiFailure, errors: SignInErrorText): Alert | null {
  switch (failure.kind) {
    case 'rate-limited':
      return { tone: 'warning', message: rateLimitedMessage(failure.retryAfterSeconds, errors) };
    case 'network':
      return { tone: 'warning', message: errors.network };
    case 'unexpected':
      return { tone: 'error', message: errors.unexpected };
    case 'http':
      switch (failure.errorCode) {
        case BFF_ERROR_CODES.HUMAN_CHECK_FAILED:
          return { tone: 'error', message: errors.humanCheckFailed };
        case BFF_ERROR_CODES.HUMAN_CHECK_UNAVAILABLE:
          return { tone: 'warning', message: errors.humanCheckUnavailable };
        case BFF_ERROR_CODES.PRIVILEGED_ACCOUNT:
          return { tone: 'warning', message: errors.privileged };
        default:
          return null;
      }
  }
}

/**
 * Credential step failure -> one generic alert: a wrong email and a wrong
 * password read the same, so the UI never tells which part was wrong or
 * whether the account exists.
 */
export function credentialAlertOf(failure: ApiFailure, errors: SignInErrorText): Alert {
  const shared = sharedFailureAlertOf(failure, errors);
  if (shared !== null) return shared;
  return failure.kind === 'http' && failure.errorCode === BFF_ERROR_CODES.INVALID_CREDENTIALS
    ? { tone: 'error', message: errors.invalidCredentials }
    : { tone: 'error', message: errors.unexpected };
}

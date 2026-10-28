import { COPY } from '../../config/Copy.constants';
import { HTTP_STATUS } from '../../config/Http.constants';
import {
  type Alert,
  type ApiFailure,
  apiFailureOf,
  formatRetryAfter,
} from '../../lib/ApiFailure.errors';
import { PrivilegedAccessError } from '../session';

const { errors } = COPY.login;

export function rateLimitedMessage(seconds: number | undefined): string {
  return formatRetryAfter(seconds, {
    waitUnknown: errors.rateLimited,
    inSeconds: errors.rateLimitedSeconds,
    inMinutes: errors.rateLimitedMinutes,
  });
}

/**
 * Any sign-in step's error -> its alert. A privileged account is checked
 * first, for both steps, so it never reads as a transport failure.
 */
export function loginErrorAlertOf<T>(
  error: unknown,
  alertOfFailure: (failure: ApiFailure) => T,
): Alert | T {
  if (error instanceof PrivilegedAccessError) {
    return { tone: 'warning', message: errors.privileged };
  }
  return alertOfFailure(apiFailureOf(error));
}

/**
 * Credential step failure -> one generic alert. Every 4xx other than 429
 * reads as "incorrect email or password", so the UI never tells which part
 * was wrong or whether the account exists.
 */
export function credentialAlertOf(failure: ApiFailure): Alert {
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', message: errors.network };
    case 'http':
      return failure.status >= HTTP_STATUS.CLIENT_ERROR_MIN &&
        failure.status < HTTP_STATUS.SERVER_ERROR_MIN
        ? { tone: 'error', message: errors.invalidCredentials }
        : { tone: 'error', message: errors.unexpected };
    case 'unexpected':
      return { tone: 'error', message: errors.unexpected };
  }
}

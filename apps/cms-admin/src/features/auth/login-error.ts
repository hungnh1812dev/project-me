import { isAxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import { HTTP_STATUS, RETRY_AFTER_HEADER } from '../../config/http.constants';

const SECONDS_PER_MINUTE = 60;

export type LoginErrorKind =
  'invalid-credentials' | 'rate-limited' | 'network' | 'unexpected';

export interface LoginError {
  kind: LoginErrorKind;
  message: string;
}

/** Whole seconds from a `Retry-After` header, or undefined when unusable. */
export function retryAfterSecondsOf(retryAfter: unknown): number | undefined {
  const seconds =
    typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim())
      ? Number(retryAfter.trim())
      : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function rateLimitedMessage(retryAfter: unknown): string {
  const seconds = retryAfterSecondsOf(retryAfter);
  if (seconds === undefined) return COPY.login.errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) {
    return COPY.login.errors.rateLimitedSeconds(seconds);
  }
  return COPY.login.errors.rateLimitedMinutes(
    Math.ceil(seconds / SECONDS_PER_MINUTE),
  );
}

/**
 * Maps a failed login to one of a few generic messages. Every 4xx other than
 * 429 reads as "incorrect email or password", so the UI never tells which
 * part was wrong or whether the account exists.
 */
export function toLoginError(error: unknown): LoginError {
  if (!isAxiosError(error)) {
    return { kind: 'unexpected', message: COPY.login.errors.unexpected };
  }
  const response = error.response;
  if (response === undefined) {
    return { kind: 'network', message: COPY.login.errors.network };
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    const headers = response.headers as Record<string, unknown>;
    return {
      kind: 'rate-limited',
      message: rateLimitedMessage(headers[RETRY_AFTER_HEADER]),
    };
  }
  if (
    response.status >= HTTP_STATUS.CLIENT_ERROR_MIN &&
    response.status < HTTP_STATUS.SERVER_ERROR_MIN
  ) {
    return {
      kind: 'invalid-credentials',
      message: COPY.login.errors.invalidCredentials,
    };
  }
  return { kind: 'unexpected', message: COPY.login.errors.unexpected };
}

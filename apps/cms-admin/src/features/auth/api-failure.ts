import { isAxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import { HTTP_STATUS, RETRY_AFTER_HEADER } from '../../config/http.constants';
import { retryAfterSecondsOf } from './login-error';

const SECONDS_PER_MINUTE = 60;

/** A failed cms-api call, reduced to what the UI branches on. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'rate-limited'; retryAfterSeconds: number | undefined }
  | { kind: 'http'; status: number; errorCode: string | undefined }
  | { kind: 'unexpected' };

export function apiFailureOf(error: unknown): ApiFailure {
  if (!isAxiosError(error)) return { kind: 'unexpected' };
  const response = error.response;
  if (response === undefined) return { kind: 'network' };
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    const headers = response.headers as Record<string, unknown>;
    return {
      kind: 'rate-limited',
      retryAfterSeconds: retryAfterSecondsOf(headers[RETRY_AFTER_HEADER]),
    };
  }
  const errorCode = (response.data as { errorCode?: unknown } | null)
    ?.errorCode;
  return {
    kind: 'http',
    status: response.status,
    errorCode: typeof errorCode === 'string' ? errorCode : undefined,
  };
}

/** "Too many attempts. Try again in …" from a Retry-After value. */
export function rateLimitedMessage(seconds: number | undefined): string {
  const { errors } = COPY.password;
  if (seconds === undefined) return errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) return errors.rateLimitedSeconds(seconds);
  return errors.rateLimitedMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

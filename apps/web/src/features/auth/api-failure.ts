import { isAxiosError } from 'axios';

import { PrivilegedAccessError } from './auth.api';
import { COPY } from '../../config/copy.constants';
import {
  HTTP_STATUS,
  RETRY_AFTER_HEADER,
  SECONDS_PER_MINUTE,
} from '../../config/http.constants';

/** A failed cms-api call, reduced to what the UI branches on. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'rate-limited'; retryAfterSeconds: number | undefined }
  | { kind: 'http'; status: number; errorCode: string | undefined }
  | { kind: 'privileged' }
  | { kind: 'unexpected' };

/** Whole seconds from a `Retry-After` header, or undefined when unusable. */
export function retryAfterSecondsOf(retryAfter: unknown): number | undefined {
  const text = typeof retryAfter === 'string' ? retryAfter.trim() : '';
  const seconds = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export function apiFailureOf(error: unknown): ApiFailure {
  if (error instanceof PrivilegedAccessError) return { kind: 'privileged' };
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

/** "Too many attempts. Try again in ..." from a Retry-After value. */
export function rateLimitedMessage(seconds: number | undefined): string {
  const { errors } = COPY.login;
  if (seconds === undefined) return errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) return errors.rateLimitedSeconds(seconds);
  return errors.rateLimitedMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

export type LoginAlertTone = 'error' | 'warning';

export interface LoginAlert {
  tone: LoginAlertTone;
  message: string;
}

/**
 * Credential step failure -> one generic alert. Every 4xx other than 429
 * reads as "incorrect email or password", so the UI never tells which part
 * was wrong or whether the account exists.
 */
export function credentialAlertOf(failure: ApiFailure): LoginAlert {
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', message: COPY.login.errors.network };
    case 'privileged':
      return { tone: 'warning', message: COPY.login.errors.privileged };
    case 'http':
      return failure.status >= HTTP_STATUS.CLIENT_ERROR_MIN &&
        failure.status < HTTP_STATUS.SERVER_ERROR_MIN
        ? { tone: 'error', message: COPY.login.errors.invalidCredentials }
        : { tone: 'error', message: COPY.login.errors.unexpected };
    case 'unexpected':
      return { tone: 'error', message: COPY.login.errors.unexpected };
  }
}

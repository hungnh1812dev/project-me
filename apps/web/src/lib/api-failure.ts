import { isAxiosError } from 'axios';

import {
  HTTP_STATUS,
  RETRY_AFTER_HEADER,
  SECONDS_PER_MINUTE,
} from '../config/http.constants';

/** A failed cms-api call, reduced to what the UI branches on. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'rate-limited'; retryAfterSeconds: number | undefined }
  | { kind: 'http'; status: number; errorCode: string | undefined }
  | { kind: 'unexpected' };

/** Whole seconds from a `Retry-After` header, or undefined when unusable. */
export function retryAfterSecondsOf(retryAfter: unknown): number | undefined {
  const text = typeof retryAfter === 'string' ? retryAfter.trim() : '';
  const seconds = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

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

/** The wording of a rate-limit message for each size of wait. */
export interface RetryAfterMessages {
  waitUnknown: string;
  inSeconds: (seconds: number) => string;
  inMinutes: (minutes: number) => string;
}

/** A rate-limit message for a Retry-After wait, in seconds or whole minutes. */
export function formatRetryAfter(
  seconds: number | undefined,
  messages: RetryAfterMessages,
): string {
  if (seconds === undefined) return messages.waitUnknown;
  if (seconds < SECONDS_PER_MINUTE) return messages.inSeconds(seconds);
  return messages.inMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

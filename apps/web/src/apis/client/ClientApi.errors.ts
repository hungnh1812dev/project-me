import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';
import { SECONDS_PER_MINUTE } from '@/configs/Http.constants';

export type AlertTone = 'error' | 'warning';

/** A message with the tone of the alert that shows it. */
export interface Alert {
  tone: AlertTone;
  message: string;
}

/** Whole seconds from a `Retry-After` header, or undefined when unusable. */
export function retryAfterSecondsOf(retryAfter: unknown): number | undefined {
  const text = typeof retryAfter === 'string' ? retryAfter.trim() : '';
  const seconds = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** A rate limit, whether the BFF or the browser client named it. */
export function isRateLimitError(error: WebApiError): boolean {
  return (
    error.errorCode === API_ERROR_CODES.BFF.RATE_LIMITED ||
    error.errorCode === API_ERROR_CODES.CLIENT.RATE_LIMITED
  );
}

/** Any thrown value as a `WebApiError`: the client already made one, anything else is unexpected. */
export function webApiErrorOf(error: unknown): WebApiError {
  return error instanceof WebApiError
    ? error
    : new WebApiError({
        source: API_ERROR_SOURCES.CLIENT,
        errorCode: API_ERROR_CODES.CLIENT.UNEXPECTED,
      });
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

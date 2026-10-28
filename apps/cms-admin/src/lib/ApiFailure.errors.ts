import { isAxiosError } from 'axios';

import { COPY } from '../config/Copy.constants';
import { HTTP_STATUS, RETRY_AFTER_HEADER } from '../config/Http.constants';

const SECONDS_PER_MINUTE = 60;

/** A failed cms-api call, reduced to what the UI branches on. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'rate-limited'; retryAfterSeconds: number | undefined }
  | { kind: 'http'; status: number; errorCode: string | undefined }
  | { kind: 'unexpected' };

/** One issue of a 400 `details.issues` (paths name the request body). */
export interface ApiIssue {
  path: readonly (string | number)[];
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

/** The `details` object of an error answer; empty when absent. */
export function apiDetailsOf(error: unknown): Record<string, unknown> {
  if (!isAxiosError(error)) return {};
  const details = (error.response?.data as { details?: unknown } | null)
    ?.details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)
    : {};
}

/** Field issues of a 400 answer; empty for any other failure. */
export function apiIssuesOf(error: unknown): ApiIssue[] {
  const raw = apiDetailsOf(error).issues;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { path, message } = item as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || typeof message !== 'string') return [];
    const parts = path.filter(
      (part): part is string | number =>
        typeof part === 'string' || typeof part === 'number',
    );
    return [{ path: parts, message }];
  });
}

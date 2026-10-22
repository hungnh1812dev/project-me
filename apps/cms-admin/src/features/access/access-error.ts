import { isAxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/http.constants';
import { apiFailureOf, rateLimitedMessage } from '../auth/api-failure';
import type { FormAlertTone } from '../auth/FormAlert';

const copy = COPY.access;

/** Field issues of a 400 answer; empty for any other failure. */
export function apiIssuesOf(error: unknown): ApiIssue[] {
  return issuesOf(detailsOf(error));
}

/** One issue of a 400 `details.issues` (paths name the request body). */
export interface ApiIssue {
  path: readonly (string | number)[];
  message: string;
}

/** A failed accounts/roles call, reduced to what the pages branch on. */
export interface AccessError {
  errorCode: string | undefined;
  status: number | undefined;
  /** Text for the alert above the form or list. */
  message: string;
  tone: FormAlertTone;
  issues: ApiIssue[];
  /** PERMISSION_NOT_HELD: indexes of the offending rows. */
  indexes: number[];
}

function detailsOf(error: unknown): Record<string, unknown> {
  if (!isAxiosError(error)) return {};
  const details = (error.response?.data as { details?: unknown } | null)
    ?.details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)
    : {};
}

function issuesOf(details: Record<string, unknown>): ApiIssue[] {
  const raw = details.issues;
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

function indexesOf(details: Record<string, unknown>): number[] {
  const raw = details.indexes;
  return Array.isArray(raw)
    ? raw.filter((value): value is number => Number.isInteger(value))
    : [];
}

const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  [API_ERROR_CODES.ACCESS_RANK_FORBIDDEN]: copy.errors.rankForbidden,
  [API_ERROR_CODES.PERMISSION_NOT_HELD]: copy.errors.permissionNotHeld,
  [API_ERROR_CODES.API_TOKEN_SCOPE_NOT_HELD]: copy.errors.scopeNotHeld,
};

export function toAccessError(error: unknown): AccessError {
  const failure = apiFailureOf(error);
  const base = {
    errorCode: undefined,
    status: undefined,
    issues: [],
    indexes: [],
  };
  switch (failure.kind) {
    case 'rate-limited':
      return {
        ...base,
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { ...base, tone: 'warning', message: copy.errors.network };
    case 'unexpected':
      return { ...base, tone: 'error', message: copy.errors.unexpected };
    case 'http': {
      const details = detailsOf(error);
      const known =
        failure.errorCode === undefined
          ? undefined
          : MESSAGE_BY_CODE[failure.errorCode];
      return {
        errorCode: failure.errorCode,
        status: failure.status,
        tone: 'error',
        message: known ?? copy.errors.unexpected,
        issues: issuesOf(details),
        indexes: indexesOf(details),
      };
    }
  }
}

/** True for a 403 answer: the caller lacks the permission for the list. */
export function isForbidden(error: unknown): boolean {
  const failure = apiFailureOf(error);
  return failure.kind === 'http' && failure.status === HTTP_STATUS.FORBIDDEN;
}

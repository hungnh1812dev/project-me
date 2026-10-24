import { type FormAlertTone } from '@abyss/form-commons';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/http.constants';
import {
  type ApiIssue,
  apiDetailsOf,
  apiFailureOf,
  apiIssuesOf,
  rateLimitedMessage,
} from '../../lib/api-failure';

const copy = COPY.access;

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
      const details = apiDetailsOf(error);
      const known =
        failure.errorCode === undefined
          ? undefined
          : MESSAGE_BY_CODE[failure.errorCode];
      return {
        errorCode: failure.errorCode,
        status: failure.status,
        tone: 'error',
        message: known ?? copy.errors.unexpected,
        issues: apiIssuesOf(error),
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

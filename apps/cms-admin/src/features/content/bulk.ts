import { isAxiosError } from 'axios';

import { BULK_ITEM_STATUS } from './content.constants';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/http.constants';
import { apiFailureOf, rateLimitedMessage } from '../../lib/api-failure';
import { serverMessage } from './content-error';
import type { BulkItemError, BulkResponse } from './content.api';

const copy = COPY.content.bulk;

/** Why one item failed, in words the user can act on. */
export function itemReason(
  errorCode: string | undefined,
  message: string | undefined,
  fallback: string = copy.itemErrors.fallback,
): string {
  switch (errorCode) {
    case API_ERROR_CODES.DOCUMENT_VERSION_CONFLICT:
      return copy.itemErrors.conflict;
    case API_ERROR_CODES.DOCUMENT_NOT_FOUND:
      return copy.itemErrors.notFound;
    default:
      return message !== undefined && message !== '' ? message : fallback;
  }
}

export interface BulkFailure {
  /** Shown above everything else. */
  message: string;
  /** Atomic request: 0-based index of the item that stopped it. */
  index?: number;
  /** Atomic request: why that item failed. */
  reason?: string;
}

function atomicIndexOf(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data as
    { details?: { index?: unknown } } | undefined;
  const index = data?.details?.index;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0
    ? index
    : undefined;
}

/** A bulk request that failed as a whole, reduced to what the UI shows. */
export function toBulkFailure(error: unknown): BulkFailure {
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return { message: rateLimitedMessage(failure.retryAfterSeconds) };
    case 'network':
      return { message: copy.errors.network };
    case 'unexpected':
      return { message: copy.errors.unexpected };
    case 'http': {
      const index = atomicIndexOf(error);
      if (index !== undefined) {
        return {
          message: copy.errors.unexpected,
          index,
          reason: itemReason(failure.errorCode, serverMessage(error)),
        };
      }
      switch (failure.errorCode) {
        case API_ERROR_CODES.DOCUMENT_NOT_PUBLISHABLE:
          return { message: copy.errors.notPublishable };
        case API_ERROR_CODES.DOCUMENT_BULK_LIMIT:
          return { message: copy.errors.limit };
        case API_ERROR_CODES.DOCUMENT_BULK_NOT_COLLECTION:
          return { message: copy.errors.notCollection };
        default:
          return {
            message:
              failure.status === HTTP_STATUS.FORBIDDEN
                ? copy.errors.forbidden
                : copy.errors.unexpected,
          };
      }
    }
  }
}

/** The failed entries of a response, in request order. */
export function failedItems(response: BulkResponse): BulkItemError[] {
  return response.results.filter(
    (result): result is BulkItemError =>
      result.status === BULK_ITEM_STATUS.ERROR,
  );
}

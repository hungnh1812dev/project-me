import {
  DomainError,
  type DomainErrorKind,
} from '../../../common/errors/Domain.errors';
import {
  describeError,
  isDescribableError,
  isServerErrorStatus,
  DOMAIN_ERROR_HTTP_STATUS,
} from '../../../common/http/describe-http-exception';
import { BULK_ITEM_STATUS } from '../domain/Documents.constants';

export interface BulkItemError {
  index: number;
  status: typeof BULK_ITEM_STATUS.ERROR;
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

export interface ErrorParts {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

const KIND_BY_STATUS: ReadonlyMap<number, DomainErrorKind> = new Map(
  Object.entries(DOMAIN_ERROR_HTTP_STATUS).map(([kind, status]) => [
    status,
    kind as DomainErrorKind,
  ]),
);

/**
 * A client error of one item; a server error is never an item result, and a
 * status no `DomainError` kind stands for fails the request as it is.
 */
export function asItemError(error: unknown): ErrorParts | null {
  if (!isDescribableError(error)) return null;
  const { statusCode, errorCode, message, details } = describeError(error);
  if (isServerErrorStatus(statusCode) || !KIND_BY_STATUS.has(statusCode)) {
    return null;
  }
  return {
    statusCode,
    errorCode,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

/** Atomic mode: the request fails with the first item's error, naming the item. */
export function atomicFailure(index: number, parts: ErrorParts): DomainError {
  return new DomainError({
    kind: KIND_BY_STATUS.get(parts.statusCode) as DomainErrorKind,
    errorCode: parts.errorCode,
    message: parts.message,
    details: { index, details: parts.details },
  });
}

export function itemError(index: number, parts: ErrorParts): BulkItemError {
  return { index, status: BULK_ITEM_STATUS.ERROR, ...parts };
}

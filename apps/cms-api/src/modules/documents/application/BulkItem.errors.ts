import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { BULK_ITEM_STATUS } from '../domain/Documents.constants';

export interface BulkItemError {
  index: number;
  status: typeof BULK_ITEM_STATUS.ERROR;
  error: DomainError;
}

/**
 * A client error of one item. A server error (`unavailable`) is never an item
 * result, and anything that is not a `DomainError` is a bug: both fail the
 * request.
 */
export function asItemError(error: unknown): DomainError | null {
  if (!(error instanceof DomainError)) return null;
  return error.kind === DOMAIN_ERROR_KINDS.UNAVAILABLE ? null : error;
}

/** Atomic mode: the request fails with the first item's error, naming the item. */
export function atomicFailure(index: number, error: DomainError): DomainError {
  return new DomainError({
    kind: error.kind,
    ...(error.errorCode === undefined ? {} : { errorCode: error.errorCode }),
    ...(error.hasMessage ? { message: error.message } : {}),
    details: { index, details: error.details },
  });
}

export function itemError(index: number, error: DomainError): BulkItemError {
  return { index, status: BULK_ITEM_STATUS.ERROR, error };
}

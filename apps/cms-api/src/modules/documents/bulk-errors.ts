import { HttpException } from '@nestjs/common';

import {
  describeError,
  isDescribableError,
  isServerErrorStatus,
} from '../../common/http/describe-http-exception';
import { BULK_ITEM_STATUS } from './domain/Documents.constants';

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

/** A client error of one item; a server error is never an item result. */
export function asItemError(error: unknown): ErrorParts | null {
  if (!isDescribableError(error)) return null;
  const { statusCode, errorCode, message, details } = describeError(error);
  if (isServerErrorStatus(statusCode)) return null;
  return {
    statusCode,
    errorCode,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

/** Atomic mode: the request fails with the first item's error, naming the item. */
export function atomicFailure(index: number, parts: ErrorParts): HttpException {
  return new HttpException(
    {
      errorCode: parts.errorCode,
      message: parts.message,
      details: { index, details: parts.details },
    },
    parts.statusCode,
  );
}

export function itemError(index: number, parts: ErrorParts): BulkItemError {
  return { index, status: BULK_ITEM_STATUS.ERROR, ...parts };
}

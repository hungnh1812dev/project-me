import { HttpException } from '@nestjs/common';

import {
  ERROR_CODE_BY_STATUS,
  ERROR_CODES,
} from '../../common/constants/error.constants';
import { BULK_ITEM_STATUS } from './documents.constants';

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

function errorParts(error: HttpException): ErrorParts {
  const statusCode = error.getStatus();
  const response = error.getResponse();
  const object =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)
      : {};
  const message =
    typeof object.message === 'string'
      ? object.message
      : Array.isArray(object.message)
        ? object.message.filter((m) => typeof m === 'string').join('; ')
        : error.message;
  return {
    statusCode,
    errorCode:
      typeof object.errorCode === 'string'
        ? object.errorCode
        : (ERROR_CODE_BY_STATUS[statusCode] ?? ERROR_CODES.HTTP_ERROR),
    message,
    ...(object.details === undefined ? {} : { details: object.details }),
  };
}

/** A client error of one item; a server error is never an item result. */
export function asItemError(error: unknown): ErrorParts | null {
  if (!(error instanceof HttpException)) return null;
  const parts = errorParts(error);
  return parts.statusCode >= 500 ? null : parts;
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

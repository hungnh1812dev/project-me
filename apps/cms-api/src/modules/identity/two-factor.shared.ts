import { HttpException, type HttpStatus } from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from './domain/Identity.constants';

/**
 * Transitional (removedBy CR-id-3): the 2FA services switch to the
 * `invalidTwoFactorCodeAtLogin` / `WhenSignedIn` constructors of
 * `domain/Identity.errors.ts`, and this file goes.
 */
export function invalidTwoFactorCode(status: HttpStatus): HttpException {
  return new HttpException(
    {
      errorCode: AUTH_ERROR_CODES.INVALID_2FA_CODE,
      message: AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
    },
    status,
  );
}

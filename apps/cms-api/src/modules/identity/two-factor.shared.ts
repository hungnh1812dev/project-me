import { HttpException, type HttpStatus } from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
} from './identity-auth.constants';
import { TOTP_ACCOUNT_SELECT } from './totp.service';

/** The OTP purpose of a mailed second-factor code (login, enable, disable). */
export const EMAIL_CODE_PURPOSE = 'LOGIN_2FA_EMAIL';

/** Account columns every 2FA operation reads. */
export const TWO_FACTOR_ACCOUNT_SELECT = {
  ...TOTP_ACCOUNT_SELECT,
  email: true,
  passwordHash: true,
  status: true,
  deletedAt: true,
  tokenVersion: true,
  is2faEnabled: true,
  twoFaMethod: true,
  role: { select: { policyVersion: true } },
} as const;

export function invalidTwoFactorCode(status: HttpStatus): HttpException {
  return new HttpException(
    {
      errorCode: AUTH_ERROR_CODES.INVALID_2FA_CODE,
      message: AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
    },
    status,
  );
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { describeError } from '../../../common/http/DescribeHttpException.rules';
import { ERROR_CODES } from '../../../common/constants/Error.constants';
import { RATE_LIMIT_MESSAGE } from '../../../common/constants/Limits.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  OWNER_SETUP_ERROR_CODES,
  OWNER_SETUP_MESSAGES,
} from './Identity.constants';
import * as errors from './Identity.errors';

const body = (errorCode: string, message: string) => ({ errorCode, message });

/** What the client sees must equal the Nest exception each constructor will replace. */
describe('identity error bodies', () => {
  it.each([
    ['notSignedIn', errors.notSignedIn(), new UnauthorizedException()],
    [
      'mailNotDelivered',
      errors.mailNotDelivered(),
      new ServiceUnavailableException(),
    ],
    [
      'invalidCredentials',
      errors.invalidCredentials(),
      new UnauthorizedException(
        body(
          AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
        ),
      ),
    ],
    [
      'wrongCurrentPassword (403, same code as the 401)',
      errors.wrongCurrentPassword(),
      new ForbiddenException(
        body(
          AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          AUTH_ERROR_MESSAGES.WRONG_CURRENT_PASSWORD,
        ),
      ),
    ],
    [
      'invalidRefreshToken',
      errors.invalidRefreshToken(),
      new UnauthorizedException(
        body(
          AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
          AUTH_ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
        ),
      ),
    ],
    [
      'invalidTempToken',
      errors.invalidTempToken(),
      new UnauthorizedException(
        body(
          AUTH_ERROR_CODES.INVALID_TEMP_TOKEN,
          AUTH_ERROR_MESSAGES.INVALID_TEMP_TOKEN,
        ),
      ),
    ],
    [
      'invalidTwoFactorCodeAtLogin (401)',
      errors.invalidTwoFactorCodeAtLogin(),
      new HttpException(
        body(
          AUTH_ERROR_CODES.INVALID_2FA_CODE,
          AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
        ),
        HttpStatus.UNAUTHORIZED,
      ),
    ],
    [
      'invalidTwoFactorCodeWhenSignedIn (403)',
      errors.invalidTwoFactorCodeWhenSignedIn(),
      new HttpException(
        body(
          AUTH_ERROR_CODES.INVALID_2FA_CODE,
          AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
        ),
        HttpStatus.FORBIDDEN,
      ),
    ],
    [
      'invalidOtp',
      errors.invalidOtp(),
      new BadRequestException(
        body(AUTH_ERROR_CODES.INVALID_OTP, AUTH_ERROR_MESSAGES.INVALID_OTP),
      ),
    ],
    [
      'weakPassword',
      errors.weakPassword(),
      new BadRequestException(
        body(AUTH_ERROR_CODES.WEAK_PASSWORD, AUTH_ERROR_MESSAGES.WEAK_PASSWORD),
      ),
    ],
    [
      'totpRequired',
      errors.totpRequired(),
      new BadRequestException(
        body(AUTH_ERROR_CODES.TOTP_REQUIRED, AUTH_ERROR_MESSAGES.TOTP_REQUIRED),
      ),
    ],
    [
      'twoFactorAlreadyEnabled',
      errors.twoFactorAlreadyEnabled(),
      new ConflictException(
        body(
          AUTH_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED,
          AUTH_ERROR_MESSAGES.TWO_FACTOR_ALREADY_ENABLED,
        ),
      ),
    ],
    [
      'twoFactorNotEnabled',
      errors.twoFactorNotEnabled(),
      new ConflictException(
        body(
          AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
          AUTH_ERROR_MESSAGES.TWO_FACTOR_NOT_ENABLED,
        ),
      ),
    ],
    [
      'twoFactorSetupRequired',
      errors.twoFactorSetupRequired(),
      new ConflictException(
        body(
          AUTH_ERROR_CODES.TWO_FACTOR_SETUP_REQUIRED,
          AUTH_ERROR_MESSAGES.TWO_FACTOR_SETUP_REQUIRED,
        ),
      ),
    ],
    [
      'tooManyRequests',
      errors.tooManyRequests(),
      new HttpException(
        body(ERROR_CODES.TOO_MANY_REQUESTS, RATE_LIMIT_MESSAGE),
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    ],
    [
      'setupTokenInvalid',
      errors.setupTokenInvalid(),
      new UnauthorizedException(
        body(
          OWNER_SETUP_ERROR_CODES.TOKEN_INVALID,
          OWNER_SETUP_MESSAGES.TOKEN_INVALID,
        ),
      ),
    ],
    [
      'ownerEmailTaken',
      errors.ownerEmailTaken(),
      new ConflictException(
        body(
          OWNER_SETUP_ERROR_CODES.EMAIL_TAKEN,
          OWNER_SETUP_MESSAGES.EMAIL_TAKEN,
        ),
      ),
    ],
    [
      'setupUnavailable',
      errors.setupUnavailable(),
      new ServiceUnavailableException(
        body(ERROR_CODES.SERVICE_UNAVAILABLE, OWNER_SETUP_MESSAGES.UNAVAILABLE),
      ),
    ],
  ])('%s answers as the Nest exception did', (_name, error, previous) => {
    expect(describeError(error)).toEqual(describeError(previous));
  });
});

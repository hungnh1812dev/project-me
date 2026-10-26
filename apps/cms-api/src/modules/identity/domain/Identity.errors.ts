import { ERROR_CODES } from '../../../common/constants/error.constants';
import { RATE_LIMIT_MESSAGE } from '../../../common/constants/limits.constants';
import { DomainError } from '../../../common/errors/Domain.errors';
import {
  DOMAIN_ERROR_KINDS,
  type DomainErrorKind,
} from '../../../common/errors/DomainErrorKinds.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  OWNER_SETUP_ERROR_CODES,
  OWNER_SETUP_MESSAGES,
} from './Identity.constants';

function refusal(
  kind: DomainErrorKind,
  errorCode: string,
  message: string,
): DomainError {
  return new DomainError({ kind, errorCode, message });
}

export const invalidCredentials = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
  );

/** A signed-in account re-typed its password wrong: 403, the sign-in itself is 401. */
export const wrongCurrentPassword = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.FORBIDDEN,
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    AUTH_ERROR_MESSAGES.WRONG_CURRENT_PASSWORD,
  );

export const invalidRefreshToken = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
    AUTH_ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
  );

export const invalidTempToken = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    AUTH_ERROR_CODES.INVALID_TEMP_TOKEN,
    AUTH_ERROR_MESSAGES.INVALID_TEMP_TOKEN,
  );

/** The second login step: 401, the caller has no session yet. */
export const invalidTwoFactorCodeAtLogin = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    AUTH_ERROR_CODES.INVALID_2FA_CODE,
    AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
  );

/** Turning 2FA on or off while signed in: 403 with the same body. */
export const invalidTwoFactorCodeWhenSignedIn = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.FORBIDDEN,
    AUTH_ERROR_CODES.INVALID_2FA_CODE,
    AUTH_ERROR_MESSAGES.INVALID_2FA_CODE,
  );

export const invalidOtp = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.INVALID_INPUT,
    AUTH_ERROR_CODES.INVALID_OTP,
    AUTH_ERROR_MESSAGES.INVALID_OTP,
  );

export const weakPassword = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.INVALID_INPUT,
    AUTH_ERROR_CODES.WEAK_PASSWORD,
    AUTH_ERROR_MESSAGES.WEAK_PASSWORD,
  );

export const totpRequired = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.INVALID_INPUT,
    AUTH_ERROR_CODES.TOTP_REQUIRED,
    AUTH_ERROR_MESSAGES.TOTP_REQUIRED,
  );

export const twoFactorAlreadyEnabled = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.CONFLICT,
    AUTH_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED,
    AUTH_ERROR_MESSAGES.TWO_FACTOR_ALREADY_ENABLED,
  );

export const twoFactorNotEnabled = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.CONFLICT,
    AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
    AUTH_ERROR_MESSAGES.TWO_FACTOR_NOT_ENABLED,
  );

export const twoFactorSetupRequired = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.CONFLICT,
    AUTH_ERROR_CODES.TWO_FACTOR_SETUP_REQUIRED,
    AUTH_ERROR_MESSAGES.TWO_FACTOR_SETUP_REQUIRED,
  );

/** Same body as the throttle guard: a full challenge store or a sixth code in the window. */
export const tooManyRequests = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.RATE_LIMITED,
    ERROR_CODES.TOO_MANY_REQUESTS,
    RATE_LIMIT_MESSAGE,
  );

export const setupTokenInvalid = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAUTHENTICATED,
    OWNER_SETUP_ERROR_CODES.TOKEN_INVALID,
    OWNER_SETUP_MESSAGES.TOKEN_INVALID,
  );

export const ownerEmailTaken = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.CONFLICT,
    OWNER_SETUP_ERROR_CODES.EMAIL_TAKEN,
    OWNER_SETUP_MESSAGES.EMAIL_TAKEN,
  );

export const setupUnavailable = (): DomainError =>
  refusal(
    DOMAIN_ERROR_KINDS.UNAVAILABLE,
    ERROR_CODES.SERVICE_UNAVAILABLE,
    OWNER_SETUP_MESSAGES.UNAVAILABLE,
  );

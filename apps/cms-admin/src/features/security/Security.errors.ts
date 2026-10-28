import { type FormAlertTone } from '@abyss/form-commons';
import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES, HTTP_STATUS } from '../../config/Http.constants';
import { apiFailureOf, rateLimitedMessage } from '../../lib/ApiFailure.errors';

/**
 * What a failed security call means for the form: a field to mark, a state
 * to reload, or a message above the form.
 */
export type SecurityError =
  | { kind: 'wrong-password' }
  | { kind: 'invalid-code' }
  | { kind: 'weak-password' }
  /** 2FA was turned on/off elsewhere: reload /me and close the dialog. */
  | { kind: 'state-changed' }
  /** Enable without a live pending secret: start the setup again. */
  | { kind: 'setup-expired' }
  | { kind: 'alert'; tone: FormAlertTone; message: string };

const BY_CODE: Readonly<Record<string, SecurityError>> = {
  [API_ERROR_CODES.INVALID_CREDENTIALS]: { kind: 'wrong-password' },
  [API_ERROR_CODES.INVALID_2FA_CODE]: { kind: 'invalid-code' },
  [API_ERROR_CODES.INVALID_OTP]: { kind: 'invalid-code' },
  [API_ERROR_CODES.WEAK_PASSWORD]: { kind: 'weak-password' },
  [API_ERROR_CODES.TWO_FACTOR_ALREADY_ENABLED]: { kind: 'state-changed' },
  [API_ERROR_CODES.TWO_FACTOR_NOT_ENABLED]: { kind: 'state-changed' },
  [API_ERROR_CODES.TWO_FACTOR_SETUP_REQUIRED]: { kind: 'setup-expired' },
};

const UNEXPECTED: SecurityError = {
  kind: 'alert',
  tone: 'error',
  message: COPY.password.errors.unexpected,
};

export function toSecurityError(error: unknown): SecurityError {
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        kind: 'alert',
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return {
        kind: 'alert',
        tone: 'warning',
        message: COPY.password.errors.network,
      };
    case 'http': {
      const known =
        failure.errorCode === undefined
          ? undefined
          : BY_CODE[failure.errorCode];
      if (known !== undefined) return known;
      return failure.status === HTTP_STATUS.CONFLICT
        ? { kind: 'state-changed' }
        : UNEXPECTED;
    }
    case 'unexpected':
      return UNEXPECTED;
  }
}

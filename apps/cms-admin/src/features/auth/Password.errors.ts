import { retryAfterSecondsOf } from '@apis/client/ApiFailure.errors';
import { API_ERROR_CODES, HTTP_STATUS, RETRY_AFTER_HEADER } from '@configs/Http.constants';
import { COMMON_TEXT } from '@configs/locales';
import { isAxiosError } from 'axios';

const SECONDS_PER_MINUTE = 60;

export type PasswordErrorKind =
  'invalid-code' | 'weak-password' | 'totp-required' | 'rate-limited' | 'network' | 'unexpected';

export interface PasswordError {
  kind: PasswordErrorKind;
  message: string;
}

const MESSAGE_BY_CODE: Readonly<Record<string, Pick<PasswordError, 'kind' | 'message'>>> = {
  [API_ERROR_CODES.INVALID_OTP]: {
    kind: 'invalid-code',
    message: COMMON_TEXT.password.errors.invalidCode,
  },
  [API_ERROR_CODES.WEAK_PASSWORD]: {
    kind: 'weak-password',
    message: COMMON_TEXT.password.errors.weakPassword,
  },
  [API_ERROR_CODES.TOTP_REQUIRED]: {
    kind: 'totp-required',
    message: COMMON_TEXT.password.errors.totpRequired,
  },
};

function rateLimitedMessage(retryAfter: unknown): string {
  const seconds = retryAfterSecondsOf(retryAfter);
  if (seconds === undefined) return COMMON_TEXT.password.errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) {
    return COMMON_TEXT.password.errors.rateLimitedSeconds(seconds);
  }
  return COMMON_TEXT.password.errors.rateLimitedMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

/** Maps a failed request-code / reset / set call to what the form shows. */
export function toPasswordError(error: unknown): PasswordError {
  if (!isAxiosError(error)) {
    return { kind: 'unexpected', message: COMMON_TEXT.password.errors.unexpected };
  }
  const response = error.response;
  if (response === undefined) {
    return { kind: 'network', message: COMMON_TEXT.password.errors.network };
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    const headers = response.headers as Record<string, unknown>;
    return {
      kind: 'rate-limited',
      message: rateLimitedMessage(headers[RETRY_AFTER_HEADER]),
    };
  }
  const errorCode = (response.data as { errorCode?: unknown } | null)?.errorCode;
  const known = typeof errorCode === 'string' ? MESSAGE_BY_CODE[errorCode] : undefined;
  return known ?? { kind: 'unexpected', message: COMMON_TEXT.password.errors.unexpected };
}

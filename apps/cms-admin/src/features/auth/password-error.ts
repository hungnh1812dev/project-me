import { isAxiosError } from 'axios';

import { COPY } from '../../config/copy.constants';
import {
  API_ERROR_CODES,
  HTTP_STATUS,
  RETRY_AFTER_HEADER,
} from '../../config/http.constants';
import { retryAfterSecondsOf } from './login-error';

const SECONDS_PER_MINUTE = 60;

export type PasswordErrorKind =
  | 'invalid-code'
  | 'weak-password'
  | 'totp-required'
  | 'rate-limited'
  | 'network'
  | 'unexpected';

export interface PasswordError {
  kind: PasswordErrorKind;
  message: string;
}

const MESSAGE_BY_CODE: Readonly<
  Record<string, Pick<PasswordError, 'kind' | 'message'>>
> = {
  [API_ERROR_CODES.INVALID_OTP]: {
    kind: 'invalid-code',
    message: COPY.password.errors.invalidCode,
  },
  [API_ERROR_CODES.WEAK_PASSWORD]: {
    kind: 'weak-password',
    message: COPY.password.errors.weakPassword,
  },
  [API_ERROR_CODES.TOTP_REQUIRED]: {
    kind: 'totp-required',
    message: COPY.password.errors.totpRequired,
  },
};

function rateLimitedMessage(retryAfter: unknown): string {
  const seconds = retryAfterSecondsOf(retryAfter);
  if (seconds === undefined) return COPY.password.errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) {
    return COPY.password.errors.rateLimitedSeconds(seconds);
  }
  return COPY.password.errors.rateLimitedMinutes(
    Math.ceil(seconds / SECONDS_PER_MINUTE),
  );
}

/** Maps a failed request-code / reset / set call to what the form shows. */
export function toPasswordError(error: unknown): PasswordError {
  if (!isAxiosError(error)) {
    return { kind: 'unexpected', message: COPY.password.errors.unexpected };
  }
  const response = error.response;
  if (response === undefined) {
    return { kind: 'network', message: COPY.password.errors.network };
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    const headers = response.headers as Record<string, unknown>;
    return {
      kind: 'rate-limited',
      message: rateLimitedMessage(headers[RETRY_AFTER_HEADER]),
    };
  }
  const errorCode = (response.data as { errorCode?: unknown } | null)
    ?.errorCode;
  const known =
    typeof errorCode === 'string' ? MESSAGE_BY_CODE[errorCode] : undefined;
  return (
    known ?? { kind: 'unexpected', message: COPY.password.errors.unexpected }
  );
}

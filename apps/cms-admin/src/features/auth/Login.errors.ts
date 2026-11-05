import { retryAfterSecondsOf } from '@apis/client/ApiFailure.errors';
import { HTTP_STATUS, RETRY_AFTER_HEADER } from '@configs/Http.constants';
import type { ScreenText } from '@configs/locales';
import { isAxiosError } from 'axios';

const SECONDS_PER_MINUTE = 60;

export type LoginErrorKind = 'invalid-credentials' | 'rate-limited' | 'network' | 'unexpected';

type LoginText = ScreenText<'login'>;

export interface LoginError {
  kind: LoginErrorKind;
  message: string;
}

function rateLimitedMessage(retryAfter: unknown, { login }: LoginText): string {
  const seconds = retryAfterSecondsOf(retryAfter);
  if (seconds === undefined) return login.errors.rateLimited;
  if (seconds < SECONDS_PER_MINUTE) {
    return login.errors.rateLimitedSeconds(seconds);
  }
  return login.errors.rateLimitedMinutes(Math.ceil(seconds / SECONDS_PER_MINUTE));
}

/**
 * Maps a failed login to one of a few generic messages. Every 4xx other than
 * 429 reads as "incorrect email or password", so the UI never tells which
 * part was wrong or whether the account exists.
 */
export function toLoginError(error: unknown, text: LoginText): LoginError {
  if (!isAxiosError(error)) {
    return { kind: 'unexpected', message: text.login.errors.unexpected };
  }
  const response = error.response;
  if (response === undefined) {
    return { kind: 'network', message: text.login.errors.network };
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    const headers = response.headers as Record<string, unknown>;
    return {
      kind: 'rate-limited',
      message: rateLimitedMessage(headers[RETRY_AFTER_HEADER], text),
    };
  }
  if (
    response.status >= HTTP_STATUS.CLIENT_ERROR_MIN &&
    response.status < HTTP_STATUS.SERVER_ERROR_MIN
  ) {
    return {
      kind: 'invalid-credentials',
      message: text.login.errors.invalidCredentials,
    };
  }
  return { kind: 'unexpected', message: text.login.errors.unexpected };
}

import { API_ERROR_CODES } from '@configs/Http.constants';
import { EN_TEXT } from '@configs/locales/en';
import { AxiosError, type AxiosResponse } from 'axios';

import { toPasswordError } from './Password.errors';

function httpError(status: number, data: unknown = null, headers: Record<string, string> = {}) {
  const response = { status, headers, data } as AxiosResponse;
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, undefined, null, response);
}

describe('toPasswordError', () => {
  it.each([
    [API_ERROR_CODES.INVALID_OTP, 'invalid-code', EN_TEXT.password.errors.invalidCode],
    [API_ERROR_CODES.WEAK_PASSWORD, 'weak-password', EN_TEXT.password.errors.weakPassword],
    [API_ERROR_CODES.TOTP_REQUIRED, 'totp-required', EN_TEXT.password.errors.totpRequired],
  ])('maps %s', (errorCode, kind, message) => {
    expect(toPasswordError(httpError(400, { errorCode }))).toEqual({
      kind,
      message,
    });
  });

  it('turns Retry-After into a wait message', () => {
    expect(toPasswordError(httpError(429, null, { 'retry-after': '30' }))).toEqual({
      kind: 'rate-limited',
      message: EN_TEXT.password.errors.rateLimitedSeconds(30),
    });
  });

  it('falls back to a generic wait without Retry-After', () => {
    expect(toPasswordError(httpError(429))).toEqual({
      kind: 'rate-limited',
      message: EN_TEXT.password.errors.rateLimited,
    });
  });

  it.each([httpError(400, { errorCode: 'SOMETHING_ELSE' }), httpError(500), new Error('boom')])(
    'reads other failures as unexpected (%#)',
    (error) => {
      expect(toPasswordError(error).kind).toBe('unexpected');
    },
  );

  it('reads a missing response as a network problem', () => {
    const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    expect(toPasswordError(error)).toEqual({
      kind: 'network',
      message: EN_TEXT.password.errors.network,
    });
  });
});

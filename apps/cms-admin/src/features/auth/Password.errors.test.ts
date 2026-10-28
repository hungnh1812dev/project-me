import { AxiosError, type AxiosResponse } from 'axios';

import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES } from '../../config/Http.constants';
import { toPasswordError } from './Password.errors';

function httpError(
  status: number,
  data: unknown = null,
  headers: Record<string, string> = {},
) {
  const response = { status, headers, data } as AxiosResponse;
  return new AxiosError(
    'failed',
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    null,
    response,
  );
}

describe('toPasswordError', () => {
  it.each([
    [
      API_ERROR_CODES.INVALID_OTP,
      'invalid-code',
      COPY.password.errors.invalidCode,
    ],
    [
      API_ERROR_CODES.WEAK_PASSWORD,
      'weak-password',
      COPY.password.errors.weakPassword,
    ],
    [
      API_ERROR_CODES.TOTP_REQUIRED,
      'totp-required',
      COPY.password.errors.totpRequired,
    ],
  ])('maps %s', (errorCode, kind, message) => {
    expect(toPasswordError(httpError(400, { errorCode }))).toEqual({
      kind,
      message,
    });
  });

  it('turns Retry-After into a wait message', () => {
    expect(
      toPasswordError(httpError(429, null, { 'retry-after': '30' })),
    ).toEqual({
      kind: 'rate-limited',
      message: COPY.password.errors.rateLimitedSeconds(30),
    });
  });

  it('falls back to a generic wait without Retry-After', () => {
    expect(toPasswordError(httpError(429))).toEqual({
      kind: 'rate-limited',
      message: COPY.password.errors.rateLimited,
    });
  });

  it.each([
    httpError(400, { errorCode: 'SOMETHING_ELSE' }),
    httpError(500),
    new Error('boom'),
  ])('reads other failures as unexpected (%#)', (error) => {
    expect(toPasswordError(error).kind).toBe('unexpected');
  });

  it('reads a missing response as a network problem', () => {
    const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    expect(toPasswordError(error)).toEqual({
      kind: 'network',
      message: COPY.password.errors.network,
    });
  });
});

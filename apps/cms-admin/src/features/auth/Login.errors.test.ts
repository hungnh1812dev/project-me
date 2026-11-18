import { EN_TEXT } from '@configs/locales/en';
import { AxiosError, type AxiosResponse } from 'axios';

import { toLoginError } from './Login.errors';

const LOGIN_TEXT = { login: EN_TEXT.login };

function httpError(status: number, headers: Record<string, string> = {}) {
  const response = { status, headers, data: null } as AxiosResponse;
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, undefined, null, response);
}

describe('toLoginError', () => {
  it.each([400, 401, 403])(
    'reads %i as incorrect credentials, without saying which part',
    (status) => {
      expect(toLoginError(httpError(status), LOGIN_TEXT)).toEqual({
        kind: 'invalid-credentials',
        message: EN_TEXT.login.errors.invalidCredentials,
      });
    },
  );

  it.each([
    ['900', EN_TEXT.login.errors.rateLimitedMinutes(15)],
    ['61', EN_TEXT.login.errors.rateLimitedMinutes(2)],
    ['60', EN_TEXT.login.errors.rateLimitedMinutes(1)],
    ['1', EN_TEXT.login.errors.rateLimitedSeconds(1)],
    ['45', EN_TEXT.login.errors.rateLimitedSeconds(45)],
  ])('turns Retry-After %s into a wait message', (retryAfter, message) => {
    expect(toLoginError(httpError(429, { 'retry-after': retryAfter }), LOGIN_TEXT)).toEqual({
      kind: 'rate-limited',
      message,
    });
  });

  it.each([undefined, '', 'soon', '-5', '0'])(
    'falls back to a generic wait message for Retry-After %s',
    (retryAfter) => {
      const headers: Record<string, string> =
        retryAfter === undefined ? {} : { 'retry-after': retryAfter };
      expect(toLoginError(httpError(429, headers), LOGIN_TEXT).message).toBe(
        EN_TEXT.login.errors.rateLimited,
      );
    },
  );

  it('reports a network error when there is no response', () => {
    const error = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    expect(toLoginError(error, LOGIN_TEXT).kind).toBe('network');
  });

  it.each([500, 503])('reports %i as unexpected', (status) => {
    expect(toLoginError(httpError(status), LOGIN_TEXT).kind).toBe('unexpected');
  });

  it('reports a non-HTTP error as unexpected', () => {
    expect(toLoginError(new Error('boom'), LOGIN_TEXT).kind).toBe('unexpected');
  });
});

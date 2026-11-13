import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import {
  formatRetryAfter,
  isRateLimitError,
  retryAfterSecondsOf,
  webApiErrorOf,
} from './ApiFailure.errors';

describe('retryAfterSecondsOf', () => {
  it.each(['0', '-3', 'soon', '', undefined])('rejects %s', (value) => {
    expect(retryAfterSecondsOf(value)).toBeUndefined();
  });

  it('reads whole seconds', () => {
    expect(retryAfterSecondsOf(' 30 ')).toBe(30);
  });
});

describe('isRateLimitError', () => {
  it.each([API_ERROR_CODES.BFF.RATE_LIMITED, API_ERROR_CODES.CLIENT.RATE_LIMITED])(
    'knows %s',
    (errorCode) => {
      expect(isRateLimitError(new WebApiError({ source: API_ERROR_SOURCES.BFF, errorCode }))).toBe(
        true,
      );
    },
  );

  it('rejects other codes', () => {
    expect(
      isRateLimitError(
        new WebApiError({ source: API_ERROR_SOURCES.BFF, errorCode: API_ERROR_CODES.CLIENT.HTTP }),
      ),
    ).toBe(false);
  });
});

describe('webApiErrorOf', () => {
  it('keeps a WebApiError and reads anything else as unexpected', () => {
    const error = new WebApiError({
      source: API_ERROR_SOURCES.BFF,
      errorCode: API_ERROR_CODES.BFF.INVALID_REQUEST,
    });
    expect(webApiErrorOf(error)).toBe(error);
    expect(webApiErrorOf(new Error('boom'))).toMatchObject({
      source: 'client',
      errorCode: 'CLIENT_UNEXPECTED',
    });
  });
});

describe('formatRetryAfter', () => {
  const messages = {
    waitUnknown: 'later',
    inSeconds: (n: number) => `${n}s`,
    inMinutes: (n: number) => `${n}m`,
  };

  it.each([
    [undefined, 'later'],
    [59, '59s'],
    [60, '1m'],
    [61, '2m'],
  ])('%s -> %s', (seconds, expected) => {
    expect(formatRetryAfter(seconds, messages)).toBe(expected);
  });
});

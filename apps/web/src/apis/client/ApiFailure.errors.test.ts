import { AxiosError, type AxiosResponse } from 'axios';

import {
  apiFailureOf,
  formatRetryAfter,
  retryAfterSecondsOf,
} from './ApiFailure.errors';

function failedWith(status: number, data: unknown, headers = {}) {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data,
    headers,
  } as AxiosResponse);
}

describe('apiFailureOf', () => {
  it('reads an answerless axios error as a network failure', () => {
    expect(apiFailureOf(new AxiosError('down'))).toEqual({ kind: 'network' });
  });

  it('reads a 429 with its Retry-After', () => {
    expect(
      apiFailureOf(failedWith(429, null, { 'retry-after': '30' })),
    ).toEqual({ kind: 'rate-limited', retryAfterSeconds: 30 });
  });

  it('keeps status and error code of other answers', () => {
    expect(apiFailureOf(failedWith(401, { errorCode: 'X' }))).toEqual({
      kind: 'http',
      status: 401,
      errorCode: 'X',
    });
  });

  it('treats a non-axios error as unexpected', () => {
    expect(apiFailureOf(new Error('boom'))).toEqual({ kind: 'unexpected' });
  });
});

describe('retryAfterSecondsOf', () => {
  it.each(['0', '-3', 'soon', '', undefined])('rejects %s', (value) => {
    expect(retryAfterSecondsOf(value)).toBeUndefined();
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

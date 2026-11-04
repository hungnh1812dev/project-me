import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  apiFailureOf,
  apiIssuesOf,
  isRequestCanceled,
  isRequestTimeout,
  rateLimitedMessage,
  retryAfterSecondsOf,
} from './ApiFailure.errors';

function failedWith(
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosError {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data,
    headers,
  } as unknown as AxiosResponse);
}

describe('api-failure', () => {
  it('reads only whole positive Retry-After seconds', () => {
    expect(retryAfterSecondsOf('30')).toBe(30);
    expect(retryAfterSecondsOf('0')).toBeUndefined();
    expect(retryAfterSecondsOf('soon')).toBeUndefined();
    expect(retryAfterSecondsOf(30)).toBeUndefined();
  });

  it('classifies network, rate-limited, http and unexpected failures', () => {
    expect(apiFailureOf(new AxiosError('down'))).toEqual({ kind: 'network' });
    expect(apiFailureOf(new Error('x'))).toEqual({ kind: 'unexpected' });
    expect(apiFailureOf(failedWith(429, {}, { 'retry-after': '90' }))).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 90,
    });
    expect(apiFailureOf(failedWith(400, { errorCode: 'X' }))).toEqual({
      kind: 'http',
      status: 400,
      errorCode: 'X',
    });
  });

  it('words the wait in seconds or rounded-up minutes', () => {
    expect(rateLimitedMessage(undefined)).not.toBe(rateLimitedMessage(30));
    expect(rateLimitedMessage(61)).toBe(rateLimitedMessage(120));
  });

  it('keeps well-formed 400 issues and drops malformed ones', () => {
    const error = failedWith(400, {
      details: {
        issues: [{ path: ['email', 0], message: 'bad' }, { path: 'email', message: 'bad' }, null],
      },
    });
    expect(apiIssuesOf(error)).toEqual([{ path: ['email', 0], message: 'bad' }]);
    expect(apiIssuesOf(new Error('x'))).toEqual([]);
  });

  it('tells a timeout from a user cancel and from a network failure', () => {
    const timedOut = new AxiosError('timeout', AxiosError.ECONNABORTED);
    const canceled = new AxiosError('canceled', AxiosError.ERR_CANCELED);
    const down = new AxiosError('down', AxiosError.ERR_NETWORK);
    expect(isRequestTimeout(timedOut)).toBe(true);
    expect(isRequestTimeout(canceled)).toBe(false);
    expect(isRequestTimeout(new Error('x'))).toBe(false);
    expect(isRequestCanceled(canceled)).toBe(true);
    expect(isRequestCanceled(timedOut)).toBe(false);
    expect(isRequestCanceled(down)).toBe(false);
  });
});

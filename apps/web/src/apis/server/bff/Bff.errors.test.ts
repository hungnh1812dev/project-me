import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { BFF_ERROR_CODES, BffError, bffErrorOf, bffErrorResponse } from './Bff.errors';

describe('bffErrorResponse', () => {
  it('appends each Set-Cookie line the refusal carries', () => {
    const response = bffErrorResponse(
      new BffError('BFF_PRIVILEGED_ACCOUNT', {}, ['a=; Max-Age=0', 'b=; Max-Age=0']),
    );
    expect(response.headers.getSetCookie()).toEqual(['a=; Max-Age=0', 'b=; Max-Age=0']);
  });

  it('answers statusCode, errorCode and a fixed message, never cached', async () => {
    const response = bffErrorResponse(new BffError('BFF_INVALID_REQUEST'));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      statusCode: 400,
      errorCode: 'BFF_INVALID_REQUEST',
      message: BFF_ERROR_CODES.BFF_INVALID_REQUEST.message,
    });
  });

  it('adds Allow to a 405 and Retry-After to a 429', () => {
    const notAllowed = bffErrorResponse(BffError.methodNotAllowed(['GET', 'POST']));
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.headers.get('allow')).toBe('GET, POST');
    const limited = bffErrorResponse(BffError.rateLimited(42));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('42');
  });

  it('lists every code with its own error code as the key', () => {
    expect(Object.keys(BFF_ERROR_CODES)).toHaveLength(15);
    expect(Object.keys(BFF_ERROR_CODES).every((code) => code.startsWith('BFF_'))).toBe(true);
  });
});

describe('BffError', () => {
  it('is a WebApiError of source bff with its status and the headers and cookies of the answer', () => {
    const error = new BffError('BFF_SESSION_REQUIRED', { a: 'b' }, ['c=; Max-Age=0']);
    expect(error).toBeInstanceOf(WebApiError);
    expect(error).toMatchObject({
      source: API_ERROR_SOURCES.BFF,
      statusCode: 401,
      headers: { a: 'b' },
      setCookies: ['c=; Max-Age=0'],
    });
  });
});

describe('bffErrorOf', () => {
  const cmsApi = (errorCode: WebApiError['errorCode'], retryAfterSeconds?: number) =>
    new WebApiError({ source: API_ERROR_SOURCES.CMS_API_REST, errorCode, retryAfterSeconds });

  it('keeps a BffError as it is', () => {
    const error = new BffError('BFF_PRIVILEGED_ACCOUNT', {}, ['x']);
    expect(bffErrorOf(error)).toBe(error);
  });

  it('maps a timeout, a rate limit and a Turnstile code, and any other failure to upstream failed', () => {
    expect(bffErrorOf(cmsApi(API_ERROR_CODES.SERVER_API.TIMEOUT)).errorCode).toBe(
      'BFF_UPSTREAM_TIMEOUT',
    );
    expect(bffErrorOf(cmsApi(API_ERROR_CODES.BFF.RATE_LIMITED, 7)).headers).toEqual({
      'retry-after': '7',
    });
    expect(
      bffErrorOf(
        new WebApiError({
          source: API_ERROR_SOURCES.TURNSTILE,
          errorCode: API_ERROR_CODES.BFF.HUMAN_CHECK_UNAVAILABLE,
        }),
      ).statusCode,
    ).toBe(503);
    expect(bffErrorOf(cmsApi(API_ERROR_CODES.SERVER_API.NETWORK)).errorCode).toBe(
      'BFF_UPSTREAM_FAILED',
    );
    expect(bffErrorOf(new Error('boom')).errorCode).toBe('BFF_UPSTREAM_FAILED');
  });
});

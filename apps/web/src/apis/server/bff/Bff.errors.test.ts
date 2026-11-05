import { BFF_ERROR_CODES, BffError, bffErrorResponse } from './Bff.errors';

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

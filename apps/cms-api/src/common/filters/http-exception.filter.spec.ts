import { type ArgumentsHost, ConflictException, Logger } from '@nestjs/common';

import { DomainError, DOMAIN_ERROR_KINDS } from '../errors/Domain.errors';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'req-1', method: 'GET', path: '/x' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return res;
}

describe('HttpExceptionFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('answers a Nest exception in the unified body', () => {
    const res = run(
      new ConflictException({ errorCode: 'TAKEN', message: 'Taken.' }),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      requestId: 'req-1',
    });
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('answers a DomainError the same way', () => {
    const res = run(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.CONFLICT,
        errorCode: 'TAKEN',
        message: 'Taken.',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      requestId: 'req-1',
    });
  });

  it('writes Retry-After for a rate_limited DomainError only', () => {
    const limited = run(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.RATE_LIMITED,
        retryAfterSeconds: 7,
      }),
    );
    expect(limited.status).toHaveBeenCalledWith(429);
    expect(limited.setHeader).toHaveBeenCalledWith('Retry-After', '7');
    const other = run(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.FORBIDDEN,
        retryAfterSeconds: 7,
      }),
    );
    expect(other.setHeader).not.toHaveBeenCalled();
  });

  it('answers an unknown error as a generic 500', () => {
    const res = run(new Error('secret'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
  });
});

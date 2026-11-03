import {
  ConflictException,
  Logger,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';

import { DOMAIN_ERROR_KINDS, DomainError } from '../errors/Domain.errors';
import { HttpExceptionFilter } from './HttpException.filter';

function run(exception: unknown, req: object = {}) {
  const res = {
    once: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'req-1', method: 'GET', path: '/x', ...req }),
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
    const res = run(new ConflictException({ errorCode: 'TAKEN', message: 'Taken.' }));
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

  describe('uploads answered before their body is read', () => {
    function unfinishedUpload(overrides: object = {}) {
      return {
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
        readableEnded: false,
        resume: jest.fn(),
        once: jest.fn(),
        on: jest.fn(),
        destroy: jest.fn(),
        ...overrides,
      };
    }

    function discardsBodyAfterAnswer(exception: unknown, req = unfinishedUpload()) {
      const res = run(exception, req);
      const onFinish = res.once.mock.calls.find(([event]) => event === 'finish') as
        [string, () => void] | undefined;
      onFinish?.[1]();
      return { res, isDiscarded: req.resume.mock.calls.length > 0, req };
    }

    it('discards the unread body after a 401 without closing the socket', () => {
      const { res, isDiscarded, req } = discardsBodyAfterAnswer(new UnauthorizedException());
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(isDiscarded).toBe(true);
      expect(req.destroy).not.toHaveBeenCalled();
    });

    it('discards the rest of the body after a 413 refused mid-upload', () => {
      const { res, isDiscarded, req } = discardsBodyAfterAnswer(
        new DomainError({ kind: DOMAIN_ERROR_KINDS.TOO_LARGE }),
      );
      expect(res.status).toHaveBeenCalledWith(413);
      expect(isDiscarded).toBe(true);
      expect(req.destroy).not.toHaveBeenCalled();
    });

    it('discards the rest of the body after a 415 found mid-upload', () => {
      const { isDiscarded } = discardsBodyAfterAnswer(
        new DomainError({ kind: DOMAIN_ERROR_KINDS.UNSUPPORTED_MEDIA_TYPE }),
      );
      expect(isDiscarded).toBe(true);
    });

    it('leaves a body that was read to the end alone', () => {
      const { res, isDiscarded } = discardsBodyAfterAnswer(
        new DomainError({ kind: DOMAIN_ERROR_KINDS.TOO_LARGE }),
        unfinishedUpload({ readableEnded: true }),
      );
      expect(res.once).not.toHaveBeenCalled();
      expect(isDiscarded).toBe(false);
    });

    it('leaves a non-multipart request alone', () => {
      const { res, isDiscarded } = discardsBodyAfterAnswer(
        new UnauthorizedException(),
        unfinishedUpload({ headers: {} }),
      );
      expect(res.once).not.toHaveBeenCalled();
      expect(isDiscarded).toBe(false);
    });
  });
});

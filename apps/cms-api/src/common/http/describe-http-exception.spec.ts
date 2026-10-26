import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { INTERNAL_ERROR_MESSAGE } from '../constants/error.constants';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
  type DomainErrorKind,
} from '../errors/Domain.errors';
import {
  describeError,
  describeHttpException,
} from './describe-http-exception';

describe('describeHttpException', () => {
  it('uses the named errorCode, message and details of a client error', () => {
    const described = describeHttpException(
      new BadRequestException({
        errorCode: 'CUSTOM',
        message: 'nope',
        details: [{ field: 'a' }],
      }),
    );
    expect(described).toEqual({
      statusCode: 400,
      errorCode: 'CUSTOM',
      message: 'nope',
      details: [{ field: 'a' }],
      isServerError: false,
    });
  });

  it('falls back to the status code and joins array messages', () => {
    const described = describeHttpException(
      new BadRequestException({ message: ['a bad', 'b bad'] }),
    );
    expect(described.errorCode).toBe('BAD_REQUEST');
    expect(described.message).toBe('a bad; b bad');
  });

  it('uses HTTP_ERROR for an unmapped client status', () => {
    const described = describeHttpException(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
    );
    expect(described.errorCode).toBe('HTTP_ERROR');
  });

  it('hides message and details of a server error', () => {
    const described = describeHttpException(
      new HttpException(
        { message: 'db down', details: { secret: 1 } },
        HttpStatus.BAD_GATEWAY,
      ),
    );
    expect(described.isServerError).toBe(true);
    expect(described.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(described.details).toBeUndefined();
  });
});

describe('describeError', () => {
  const nestExceptionOf: Record<DomainErrorKind, () => HttpException> = {
    invalid_input: () => new BadRequestException(),
    unauthenticated: () => new UnauthorizedException(),
    forbidden: () => new ForbiddenException(),
    not_found: () => new NotFoundException(),
    conflict: () => new ConflictException(),
    too_large: () => new PayloadTooLargeException(),
    unsupported_media_type: () => new UnsupportedMediaTypeException(),
    rate_limited: () =>
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    unavailable: () => new ServiceUnavailableException(),
  };

  it.each(Object.values(DOMAIN_ERROR_KINDS))(
    'a bare %s DomainError reads like the matching Nest exception',
    (kind) => {
      expect(describeError(new DomainError({ kind }))).toEqual(
        describeHttpException(nestExceptionOf[kind]()),
      );
    },
  );

  it('uses the given errorCode, message and details of a client error', () => {
    const described = describeError(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.CONFLICT,
        errorCode: 'CUSTOM',
        message: 'nope',
        details: [{ field: 'a' }],
      }),
    );
    expect(described).toEqual({
      statusCode: 409,
      errorCode: 'CUSTOM',
      message: 'nope',
      details: [{ field: 'a' }],
      isServerError: false,
    });
  });

  it('keeps the code but hides message and details of unavailable', () => {
    const described = describeError(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.UNAVAILABLE,
        errorCode: 'DB_DOWN',
        message: 'db down',
        details: { secret: 1 },
      }),
    );
    expect(described.statusCode).toBe(503);
    expect(described.errorCode).toBe('DB_DOWN');
    expect(described.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(described.details).toBeUndefined();
    expect(described.isServerError).toBe(true);
  });

  it('rounds retryAfterSeconds up, at least 1, and only for rate_limited', () => {
    const rateLimited = (retryAfterSeconds: number) =>
      describeError(
        new DomainError({
          kind: DOMAIN_ERROR_KINDS.RATE_LIMITED,
          retryAfterSeconds,
        }),
      ).retryAfterSeconds;
    expect(rateLimited(2.2)).toBe(3);
    expect(rateLimited(0)).toBe(1);
    expect(rateLimited(-5)).toBe(1);
    expect(rateLimited(Number.NaN)).toBe(1);
    expect(rateLimited(Number.POSITIVE_INFINITY)).toBe(Number.MAX_SAFE_INTEGER);
    expect(rateLimited(1e22)).toBe(Number.MAX_SAFE_INTEGER);
    expect(String(rateLimited(1e22))).not.toContain('e');
    expect(
      describeError(
        new DomainError({
          kind: DOMAIN_ERROR_KINDS.CONFLICT,
          retryAfterSeconds: 5,
        }),
      ).retryAfterSeconds,
    ).toBeUndefined();
  });

  it('reads anything else as a generic 500 without its message', () => {
    for (const thrown of [new Error('secret'), 'text', null, undefined]) {
      expect(describeError(thrown)).toEqual({
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        message: INTERNAL_ERROR_MESSAGE,
        isServerError: true,
      });
    }
  });
});

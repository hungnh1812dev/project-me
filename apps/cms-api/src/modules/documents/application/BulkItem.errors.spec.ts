import {
  ConflictException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import { describeError } from '../../../common/http/describe-http-exception';
import { asItemError, atomicFailure } from './BulkItem.errors';

describe('asItemError', () => {
  it('reads a Nest client error and a DomainError identically', () => {
    const fromNest = asItemError(
      new ConflictException({
        errorCode: 'TAKEN',
        message: 'Taken.',
        details: { field: 'slug' },
      }),
    );
    const fromDomain = asItemError(
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.CONFLICT,
        errorCode: 'TAKEN',
        message: 'Taken.',
        details: { field: 'slug' },
      }),
    );
    expect(fromDomain).toEqual(fromNest);
    expect(fromDomain).toEqual({
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      details: { field: 'slug' },
    });
  });

  it('is null for a server error, a DomainError unavailable and a bug', () => {
    expect(asItemError(new InternalServerErrorException())).toBeNull();
    expect(
      asItemError(new DomainError({ kind: DOMAIN_ERROR_KINDS.UNAVAILABLE })),
    ).toBeNull();
    expect(asItemError(new Error('x'))).toBeNull();
  });

  it('is null for a client status no DomainError kind stands for', () => {
    expect(asItemError(new HttpException('x', HttpStatus.GONE))).toBeNull();
  });
});

describe('atomicFailure', () => {
  it('keeps the status, code and message and names the item', () => {
    const failure = atomicFailure(3, {
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      details: { field: 'slug' },
    });
    expect(failure).toBeInstanceOf(DomainError);
    expect(describeError(failure)).toMatchObject({
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      details: { index: 3, details: { field: 'slug' } },
    });
  });
});

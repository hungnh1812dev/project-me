import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';

import { DomainError } from '../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../common/errors/DomainErrorKinds.constants';
import { asItemError } from './bulk-errors';

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
});

import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { describeError } from '../../../common/http/describe-http-exception';
import { asItemError, atomicFailure } from './BulkItem.errors';

describe('asItemError', () => {
  it('keeps a DomainError that is a client error', () => {
    const error = new DomainError({
      kind: DOMAIN_ERROR_KINDS.CONFLICT,
      errorCode: 'TAKEN',
      message: 'Taken.',
      details: { field: 'slug' },
    });
    expect(asItemError(error)).toBe(error);
  });

  it('is null for unavailable, a Nest exception and a bug', () => {
    expect(
      asItemError(new DomainError({ kind: DOMAIN_ERROR_KINDS.UNAVAILABLE })),
    ).toBeNull();
    expect(asItemError({ getStatus: () => 409 })).toBeNull();
    expect(asItemError(new Error('x'))).toBeNull();
  });
});

describe('atomicFailure', () => {
  it('keeps the status, code and message and names the item', () => {
    const failure = atomicFailure(
      3,
      new DomainError({
        kind: DOMAIN_ERROR_KINDS.CONFLICT,
        errorCode: 'TAKEN',
        message: 'Taken.',
        details: { field: 'slug' },
      }),
    );
    expect(failure).toBeInstanceOf(DomainError);
    expect(describeError(failure)).toMatchObject({
      statusCode: 409,
      errorCode: 'TAKEN',
      message: 'Taken.',
      details: { index: 3, details: { field: 'slug' } },
    });
  });

  it('answers the default message of the kind when the item had none', () => {
    const failure = atomicFailure(
      0,
      new DomainError({ kind: DOMAIN_ERROR_KINDS.NOT_FOUND }),
    );
    expect(describeError(failure)).toMatchObject({
      statusCode: 404,
      message: 'Not Found',
    });
  });
});

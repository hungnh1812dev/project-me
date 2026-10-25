import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { DomainError } from '../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../common/errors/DomainErrorKinds.constants';
import { asItemError } from '../modules/documents/bulk-errors';
import { formatGraphqlError } from '../modules/graphql/error-format';

const DETAILS = { field: 'slug' };
const error = new DomainError({
  kind: DOMAIN_ERROR_KINDS.CONFLICT,
  errorCode: 'SLUG_TAKEN',
  message: 'The slug is taken.',
  details: DETAILS,
});

function restBody(): Record<string, unknown> {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'r', method: 'GET', path: '/' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(error, host);
  const [body] = res.json.mock.calls[0] as [Record<string, unknown>];
  return body;
}

describe('one DomainError through every error reader', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('gives the same status, code, message and details', () => {
    const rest = restBody();
    const graphql = formatGraphqlError(
      new GraphQLError('wrapped', { path: ['x'], originalError: error }),
      { phase: 'execute', requestId: 'r', shouldStripSuggestions: false },
    );
    const bulk = asItemError(error);

    const expected = {
      errorCode: 'SLUG_TAKEN',
      message: 'The slug is taken.',
      details: DETAILS,
    };
    expect(rest).toMatchObject({ statusCode: 409, ...expected });
    expect(bulk).toEqual({ statusCode: 409, ...expected });
    expect(graphql.message).toBe(expected.message);
    expect(graphql.extensions).toMatchObject({
      code: expected.errorCode,
      details: expected.details,
    });
  });
});

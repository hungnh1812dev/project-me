import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { HttpExceptionFilter } from '../../src/common/filters/HttpException.filter';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../src/common/errors/Domain.errors';
import { itemError } from '../../src/modules/documents/application/BulkItem.errors';
import { toBulkBody } from '../../src/modules/documents/http/Bulk.controller';
import { formatGraphqlError } from '../../src/modules/graphql/http/GraphqlError.filter';

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
    const [bulk] = toBulkBody({
      atomic: false,
      succeeded: 0,
      failed: 1,
      results: [itemError(0, error)],
    }).results;

    const expected = {
      errorCode: 'SLUG_TAKEN',
      message: 'The slug is taken.',
      details: DETAILS,
    };
    expect(rest).toMatchObject({ statusCode: 409, ...expected });
    expect(bulk).toEqual({
      index: 0,
      status: 'error',
      statusCode: 409,
      ...expected,
    });
    expect(graphql.message).toBe(expected.message);
    expect(graphql.extensions).toMatchObject({
      code: expected.errorCode,
      details: expected.details,
    });
  });
});

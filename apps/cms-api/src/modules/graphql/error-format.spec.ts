import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { Logger } from '@nestjs/common';

import { formatGraphqlError } from './error-format';

const options = {
  phase: 'execute',
  requestId: 'req-1',
  stripSuggestions: false,
} as const;
const wrapped = (
  original: unknown,
  path: (string | number)[] = ['articleList'],
) => new GraphQLError('wrapped', { path, originalError: original as Error });

describe('formatGraphqlError', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('maps a Nest exception to its REST errorCode, message and details', () => {
    const error = wrapped(
      new BadRequestException({
        errorCode: 'FIELD_NOT_READABLE',
        message: 'Field is not readable.',
        details: { field: 'company' },
      }),
    );
    expect(formatGraphqlError(error, options)).toEqual({
      message: 'Field is not readable.',
      path: ['articleList'],
      extensions: {
        code: 'FIELD_NOT_READABLE',
        details: { field: 'company' },
        requestId: 'req-1',
      },
    });
  });

  it('falls back to the status code when the exception names none', () => {
    const formatted = formatGraphqlError(
      wrapped(new ForbiddenException()),
      options,
    );
    expect(formatted.extensions.code).toBe('FORBIDDEN');
  });

  it('hides 5xx and unknown errors behind a generic message without details', () => {
    for (const original of [
      new InternalServerErrorException({
        details: { secret: 1 },
        message: 'db host x',
      }),
      new Error('connection to 10.0.0.1 failed'),
    ]) {
      const formatted = formatGraphqlError(wrapped(original), options);
      expect(formatted.message).toBe('Internal server error');
      expect(formatted.extensions).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: 'req-1',
      });
    }
  });

  it('uses the phase code for parse and validation errors', () => {
    const parse = formatGraphqlError(new GraphQLError('Syntax Error'), {
      ...options,
      phase: 'parse',
    });
    const validate = formatGraphqlError(new GraphQLError('bad'), {
      ...options,
      phase: 'validate',
    });
    expect(parse.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
    expect(validate.extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
  });

  it('never echoes a variable value', () => {
    const named = formatGraphqlError(
      new GraphQLError(
        'Variable "$page" got invalid value "SECRET"; Int cannot represent',
      ),
      options,
    );
    const anonymous = formatGraphqlError(
      new GraphQLError('Variable of weird "SECRET"'),
      options,
    );
    expect(named.message).toBe('Variable "$page" is not valid.');
    expect(JSON.stringify([named, anonymous])).not.toContain('SECRET');
  });

  it('strips suggestions everywhere in production, and on the Query type always', () => {
    const typo = new GraphQLError(
      'Cannot query field "articleLis" on type "Query". Did you mean "articleList"?',
    );
    const other = new GraphQLError(
      'Cannot query field "titl" on type "Article". Did you mean "title"?',
    );
    const validate = { ...options, phase: 'validate' } as const;
    expect(formatGraphqlError(typo, validate).message).toBe(
      'Cannot query field "articleLis" on type "Query".',
    );
    expect(formatGraphqlError(other, validate).message).toContain(
      'Did you mean',
    );
    expect(
      formatGraphqlError(other, { ...validate, stripSuggestions: true })
        .message,
    ).toBe('Cannot query field "titl" on type "Article".');
  });
});

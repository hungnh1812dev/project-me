import { DomainError } from '../../../common/errors/Domain.errors';
import { describeError } from '../../../common/http/describe-http-exception';
import { DOCUMENT_QUERY_LIMITS, parseListQuery } from '../../documents';
import { type ListArguments, toListQuery } from './ListArguments.rules';
import { PAGINATION } from '../../../common/validation/SharedSchemas.rules';
import { INVALID_REQUEST_ERROR } from '../../../common/constants/error.constants';

const base: ListArguments = {
  status: 'published',
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
};

describe('toListQuery', () => {
  it('uses the default sort when none or an empty list is given', () => {
    const expected = [{ path: 'updatedAt', direction: 'desc' }];
    expect(toListQuery(base).sort).toEqual(expected);
    expect(toListQuery({ ...base, sort: [] }).sort).toEqual(expected);
    expect(toListQuery({ ...base, sort: null }).sort).toEqual(expected);
  });

  it('converts sort and filter to the REST shapes', () => {
    const query = toListQuery({
      ...base,
      sort: [{ field: 'title', direction: 'desc' }, { field: 'version' }],
      filter: { priority: { gte: 2, in: [1, 2] }, title: { eq: null } },
    });
    expect(query.sort).toEqual([
      { path: 'title', direction: 'desc' },
      { path: 'version', direction: 'asc' },
    ]);
    expect(query.filters).toEqual([
      { path: 'priority', op: 'gte', values: ['2'] },
      { path: 'priority', op: 'in', values: ['1', '2'] },
    ]);
  });

  it('accepts the range limits and rejects one past them', () => {
    expect(() => toListQuery({ ...base, page: 1 })).not.toThrow(DomainError);
    expect(() =>
      toListQuery({ ...base, page: DOCUMENT_QUERY_LIMITS.MAX_PAGE }),
    ).not.toThrow(DomainError);
    expect(() =>
      toListQuery({ ...base, pageSize: PAGINATION.MAX_PAGE_SIZE }),
    ).not.toThrow(DomainError);
    for (const bad of [
      { page: 0 },
      { page: DOCUMENT_QUERY_LIMITS.MAX_PAGE + 1 },
      { page: 1.5 },
      { pageSize: 0 },
      { pageSize: PAGINATION.MAX_PAGE_SIZE + 1 },
      { pageSize: -1 },
    ]) {
      expect(() => toListQuery({ ...base, ...bad })).toThrow(DomainError);
    }
  });

  it('limits sort keys, filters and values like REST', () => {
    const keys = (n: number) =>
      ['a', 'b', 'c', 'd'].slice(0, n).map((field) => ({ field }));
    expect(() => toListQuery({ ...base, sort: keys(3) })).not.toThrow(
      DomainError,
    );
    expect(() => toListQuery({ ...base, sort: keys(4) })).toThrow(DomainError);
    expect(() =>
      toListQuery({ ...base, sort: [{ field: 'a' }, { field: 'a' }] }),
    ).toThrow(DomainError);
    const filters = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`f${i}`, { eq: 'x' }]),
      );
    expect(() =>
      toListQuery({
        ...base,
        filter: filters(DOCUMENT_QUERY_LIMITS.MAX_FILTERS),
      }),
    ).not.toThrow(DomainError);
    expect(() =>
      toListQuery({
        ...base,
        filter: filters(DOCUMENT_QUERY_LIMITS.MAX_FILTERS + 1),
      }),
    ).toThrow(DomainError);
    const many = (n: number) => ({
      title: { in: Array.from({ length: n }, () => 'x') },
    });
    expect(() =>
      toListQuery({
        ...base,
        filter: many(DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES),
      }),
    ).not.toThrow(DomainError);
    expect(() =>
      toListQuery({
        ...base,
        filter: many(DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES + 1),
      }),
    ).toThrow(DomainError);
    expect(() => toListQuery({ ...base, filter: many(0) })).toThrow(
      DomainError,
    );
    expect(() =>
      toListQuery({
        ...base,
        filter: {
          title: { eq: 'x'.repeat(DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH + 1) },
        },
      }),
    ).toThrow(DomainError);
  });

  it('never puts a submitted value in the error', () => {
    const attempt = () =>
      toListQuery({ ...base, filter: { title: { eq: 'x'.repeat(300) } } });
    expect(attempt).toThrow(DomainError);
    const error = (() => {
      try {
        attempt();
      } catch (caught) {
        return describeError(caught);
      }
      return undefined;
    })();
    expect(JSON.stringify(error)).not.toContain('xxx');
  });
});

describe('REST and GraphQL list limits', () => {
  const longValue = 'x'.repeat(DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH + 1);
  const keysOf = (n: number) => ['a', 'b', 'c', 'd'].slice(0, n).join(',');
  const manyFilters = DOCUMENT_QUERY_LIMITS.MAX_FILTERS + 1;
  const manyValues = DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES + 1;

  const cases: [string, Record<string, unknown>, Partial<ListArguments>][] = [
    ['page 0', { page: '0' }, { page: 0 }],
    [
      'page past the maximum',
      { page: String(DOCUMENT_QUERY_LIMITS.MAX_PAGE + 1) },
      { page: DOCUMENT_QUERY_LIMITS.MAX_PAGE + 1 },
    ],
    ['pageSize 0', { pageSize: '0' }, { pageSize: 0 }],
    [
      'pageSize past the maximum',
      { pageSize: String(PAGINATION.MAX_PAGE_SIZE + 1) },
      { pageSize: PAGINATION.MAX_PAGE_SIZE + 1 },
    ],
    [
      'too many sort keys',
      { sort: keysOf(4) },
      {
        sort: keysOf(4)
          .split(',')
          .map((field) => ({ field })),
      },
    ],
    [
      'a repeated sort key',
      { sort: 'a,a' },
      { sort: [{ field: 'a' }, { field: 'a' }] },
    ],
    [
      'too many filters',
      Object.fromEntries(
        Array.from({ length: manyFilters }, (_, i) => [`filter[f${i}]`, 'x']),
      ),
      {
        filter: Object.fromEntries(
          Array.from({ length: manyFilters }, (_, i) => [`f${i}`, { eq: 'x' }]),
        ),
      },
    ],
    [
      'too many in values',
      { 'filter[t][in]': Array.from({ length: manyValues }, () => 'x') },
      { filter: { t: { in: Array.from({ length: manyValues }, () => 'x') } } },
    ],
    [
      'an overlong value',
      { 'filter[t]': longValue },
      { filter: { t: { eq: longValue } } },
    ],
    [
      'an empty in list',
      { 'filter[t][in]': [] },
      { filter: { t: { in: [] } } },
    ],
  ];

  it.each(cases)('both reject %s', (_name, restQuery, graphqlOverride) => {
    expect(() => parseListQuery(restQuery)).toThrow(
      INVALID_REQUEST_ERROR.MESSAGE,
    );
    expect(() => toListQuery({ ...base, ...graphqlOverride })).toThrow(
      DomainError,
    );
  });
});

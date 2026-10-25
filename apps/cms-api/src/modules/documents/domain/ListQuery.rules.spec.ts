import { DomainError } from '../../../common/errors/Domain.errors';
import { PAGINATION } from '../../../common/validation/SharedSchemas.rules';
import { DOCUMENT_QUERY_LIMITS } from './Documents.constants';
import { type ListDocumentsQuery, normalizeListQuery } from './ListQuery.rules';

const base: ListDocumentsQuery = {
  status: 'published',
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  sort: [],
  filters: [],
};

const eq = (path: string, value = 'x') => ({
  path,
  op: 'eq' as const,
  values: [value],
});

describe('normalizeListQuery', () => {
  it('fills the default sort when none is given', () => {
    expect(normalizeListQuery(base).sort).toEqual([
      { path: 'updatedAt', direction: 'desc' },
    ]);
  });

  it('keeps a requested sort and the filters', () => {
    const query = {
      ...base,
      sort: [{ path: 'title', direction: 'asc' as const }],
      filters: [eq('title')],
    };
    expect(normalizeListQuery(query)).toEqual(query);
  });

  it.each([
    ['page 0', { page: 0 }],
    ['page past the maximum', { page: DOCUMENT_QUERY_LIMITS.MAX_PAGE + 1 }],
    ['fractional page', { page: 1.5 }],
    ['pageSize 0', { pageSize: 0 }],
    ['pageSize past the maximum', { pageSize: PAGINATION.MAX_PAGE_SIZE + 1 }],
    ['a malformed sort path', { sort: [{ path: 'a;b', direction: 'asc' }] }],
    ['a malformed filter path', { filters: [eq('1bad')] }],
    [
      'an overlong filter value',
      {
        filters: [
          eq('title', 'x'.repeat(DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH + 1)),
        ],
      },
    ],
    [
      'an eq filter with two values',
      { filters: [{ ...eq('t'), values: ['a', 'b'] }] },
    ],
    ['a filter without values', { filters: [{ ...eq('t'), values: [] }] }],
  ])('rejects %s', (_name, override) => {
    expect(() =>
      normalizeListQuery({ ...base, ...override } as ListDocumentsQuery),
    ).toThrow(DomainError);
  });

  it('accepts the limits exactly', () => {
    expect(() =>
      normalizeListQuery({
        ...base,
        page: DOCUMENT_QUERY_LIMITS.MAX_PAGE,
        pageSize: PAGINATION.MAX_PAGE_SIZE,
        filters: Array.from(
          { length: DOCUMENT_QUERY_LIMITS.MAX_FILTERS },
          (_, i) => eq(`f${i}`),
        ),
      }),
    ).not.toThrow();
  });
});

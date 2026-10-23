import { BadRequestException } from '@nestjs/common';

import { PAGINATION } from '../../common/http/request-parsing';
import { DOCUMENT_QUERY_LIMITS } from '../documents';
import { type ListArguments, toListQuery } from './list-arguments';

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
    expect(() => toListQuery({ ...base, page: 1 })).not.toThrow(
      BadRequestException,
    );
    expect(() =>
      toListQuery({ ...base, page: DOCUMENT_QUERY_LIMITS.MAX_PAGE }),
    ).not.toThrow(BadRequestException);
    expect(() =>
      toListQuery({ ...base, pageSize: PAGINATION.MAX_PAGE_SIZE }),
    ).not.toThrow(BadRequestException);
    for (const bad of [
      { page: 0 },
      { page: DOCUMENT_QUERY_LIMITS.MAX_PAGE + 1 },
      { page: 1.5 },
      { pageSize: 0 },
      { pageSize: PAGINATION.MAX_PAGE_SIZE + 1 },
      { pageSize: -1 },
    ]) {
      expect(() => toListQuery({ ...base, ...bad })).toThrow(
        BadRequestException,
      );
    }
  });

  it('limits sort keys, filters and values like REST', () => {
    const keys = (n: number) =>
      ['a', 'b', 'c', 'd'].slice(0, n).map((field) => ({ field }));
    expect(() => toListQuery({ ...base, sort: keys(3) })).not.toThrow(
      BadRequestException,
    );
    expect(() => toListQuery({ ...base, sort: keys(4) })).toThrow(
      BadRequestException,
    );
    expect(() =>
      toListQuery({ ...base, sort: [{ field: 'a' }, { field: 'a' }] }),
    ).toThrow(BadRequestException);
    const filters = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`f${i}`, { eq: 'x' }]),
      );
    expect(() =>
      toListQuery({
        ...base,
        filter: filters(DOCUMENT_QUERY_LIMITS.MAX_FILTERS),
      }),
    ).not.toThrow(BadRequestException);
    expect(() =>
      toListQuery({
        ...base,
        filter: filters(DOCUMENT_QUERY_LIMITS.MAX_FILTERS + 1),
      }),
    ).toThrow(BadRequestException);
    const many = (n: number) => ({
      title: { in: Array.from({ length: n }, () => 'x') },
    });
    expect(() =>
      toListQuery({
        ...base,
        filter: many(DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES),
      }),
    ).not.toThrow(BadRequestException);
    expect(() =>
      toListQuery({
        ...base,
        filter: many(DOCUMENT_QUERY_LIMITS.MAX_IN_VALUES + 1),
      }),
    ).toThrow(BadRequestException);
    expect(() => toListQuery({ ...base, filter: many(0) })).toThrow(
      BadRequestException,
    );
    expect(() =>
      toListQuery({
        ...base,
        filter: {
          title: { eq: 'x'.repeat(DOCUMENT_QUERY_LIMITS.MAX_VALUE_LENGTH + 1) },
        },
      }),
    ).toThrow(BadRequestException);
  });

  it('never puts a submitted value in the error', () => {
    const attempt = () =>
      toListQuery({ ...base, filter: { title: { eq: 'x'.repeat(300) } } });
    expect(attempt).toThrow(BadRequestException);
    const error = (() => {
      try {
        attempt();
      } catch (caught) {
        return caught as BadRequestException;
      }
      return undefined;
    })();
    expect(JSON.stringify(error?.getResponse())).not.toContain('xxx');
  });
});

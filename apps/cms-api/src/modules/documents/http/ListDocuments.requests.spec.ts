import { describeError } from '../../../common/http/describe-http-exception';
import { parseListQuery } from './ListDocuments.requests';

function refusalOf(query: unknown) {
  try {
    parseListQuery(query);
  } catch (error) {
    return describeError(error);
  }
  return undefined;
}

describe('parseListQuery', () => {
  it('defaults to published, page 1, 20 per page, newest update first', () => {
    expect(parseListQuery({})).toEqual({
      status: 'published',
      page: 1,
      pageSize: 20,
      sort: [{ path: 'updatedAt', direction: 'desc' }],
      filters: [],
    });
  });

  it('reads flat filter keys with and without an operator', () => {
    const query = parseListQuery({
      'filter[title]': 'a',
      'filter[priority][gte]': '3',
      'filter[priority][in]': ['1', '2'],
      'filter[reference.name]': 'Ann',
    });
    expect(query.filters).toEqual([
      { path: 'title', op: 'eq', values: ['a'] },
      { path: 'priority', op: 'gte', values: ['3'] },
      { path: 'priority', op: 'in', values: ['1', '2'] },
      { path: 'reference.name', op: 'eq', values: ['Ann'] },
    ]);
  });

  it('reads sort keys, "-" meaning descending', () => {
    expect(parseListQuery({ sort: 'title,-priority' }).sort).toEqual([
      { path: 'title', direction: 'asc' },
      { path: 'priority', direction: 'desc' },
    ]);
  });

  it.each([
    [{ 'filter[title': 'a' }],
    [{ 'filter[]': 'a' }],
    [{ 'filter[a][b][c]': 'a' }],
    [{ 'filter[title][like]': 'a' }],
    [{ 'filter[title]': ['a', 'b'] }],
    [{ 'filter[title][in]': [] }],
    [{ 'filter[title]': 'x'.repeat(256) }],
    [{ 'filter[1bad]': 'a' }],
    [{ 'filter[title]': { nested: 'a' } }],
    [{ sort: 'title;drop' }],
    [{ sort: '--title' }],
    [{ sort: 'a,b,c,d' }],
    [{ sort: ['a', 'b'] }],
    [{ status: 'DRAFT' }],
    [{ page: '0' }],
    [{ page: '10001' }],
    [{ pageSize: '0' }],
    [{ other: 'x' }],
  ])('rejects %j', (query) => {
    expect(refusalOf(query)).toMatchObject({
      statusCode: 400,
      errorCode: 'ACCESS_INVALID_REQUEST',
    });
  });

  it('rejects more filters than the limit', () => {
    const query = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`filter[f${i}]`, 'x']),
    );
    expect(refusalOf(query)).toMatchObject({
      statusCode: 400,
      errorCode: 'ACCESS_INVALID_REQUEST',
    });
  });

  it('never echoes a submitted value in the error', () => {
    const response = JSON.stringify(
      refusalOf({ 'filter[title]': 'x'.repeat(300), sort: 'SECRET;' }),
    );
    expect(response).toContain('ACCESS_INVALID_REQUEST');
    expect(response).not.toMatch(/SECRET|xxxx/);
  });
});

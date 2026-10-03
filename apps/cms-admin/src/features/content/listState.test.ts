import { describe, expect, it } from 'vitest';

import { makeContentType, makeFieldSet } from '@/test/contentFixtures';

import { buildColumnCatalog } from './columns';
import {
  DEFAULT_LIST_STATE,
  PAGE_SIZES,
  parseListState,
  serializeListState,
  toListParams,
  type ListState,
} from './listState';

const catalog = buildColumnCatalog(makeContentType({ fields: makeFieldSet() }));

const state = (overrides: Partial<ListState> = {}): ListState => ({
  ...DEFAULT_LIST_STATE,
  ...overrides,
});

describe('parseListState (AC-3)', () => {
  it('gives the defaults for an empty URL', () => {
    expect(parseListState('', catalog)).toEqual({ state: DEFAULT_LIST_STATE, dropped: [] });
    expect(DEFAULT_LIST_STATE).toEqual({
      page: 1,
      size: 20,
      orderBy: 'id',
      sortDir: 'desc',
      q: '',
      filters: {},
    });
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
  });

  it('reads every param of a valid URL', () => {
    const search =
      '?page=3&size=50&orderBy=title&sortDir=asc&q=hello&filters[featured][$eq]=true' +
      '&filters[views][$gte]=10&filters[createdAt][$lt]=2026-02-01';
    expect(parseListState(search, catalog)).toEqual({
      state: {
        page: 3,
        size: 50,
        orderBy: 'title',
        sortDir: 'asc',
        q: 'hello',
        filters: {
          featured: { op: '$eq', value: 'true' },
          views: { op: '$gte', value: '10' },
          createdAt: { op: '$lt', value: '2026-02-01' },
        },
      },
      dropped: [],
    });
  });

  it('accepts a URLSearchParams and encoded brackets', () => {
    const search = new URLSearchParams('filters%5Btitle%5D%5B%24contains%5D=a%20b');
    expect(parseListState(search, catalog).state.filters).toEqual({
      title: { op: '$contains', value: 'a b' },
    });
  });

  it.each<[string, string, Partial<ListState>]>([
    ['a page of 0', 'page=0', {}],
    ['a negative page', 'page=-2', {}],
    ['a fractional page', 'page=1.5', {}],
    ['a page with letters', 'page=2x', {}],
    ['an empty page', 'page=', {}],
    ['a huge page', 'page=99999999999999999999', {}],
    ['a size outside the options', 'size=30', {}],
    ['a size over 100', 'size=1000', {}],
    ['a non-numeric size', 'size=big', {}],
    ['a bad sortDir', 'sortDir=up', {}],
    ['an empty search', 'q=%20%20', {}],
    ['a search with spaces around it', 'q=%20hi%20', { q: 'hi' }],
    ['an unrelated param', 'utm_source=mail', {}],
    ['the largest allowed page', 'page=999999999', { page: 999999999 }],
  ])('silently fixes %s', (_case, search, expected) => {
    expect(parseListState(search, catalog)).toEqual({ state: state(expected), dropped: [] });
  });

  it.each<[string, string, string[]]>([
    ['a richtext orderBy', 'orderBy=body', ['orderBy']],
    ['a media orderBy', 'orderBy=coverImage', ['orderBy']],
    ['an unknown orderBy', 'orderBy=nope', ['orderBy']],
    ['a status orderBy', 'orderBy=status', ['orderBy']],
    ['an empty orderBy', 'orderBy=', ['orderBy']],
    ['an unknown filter key', 'filters[nope][$eq]=1', ['filters[nope][$eq]']],
    ['a status filter (D7)', 'filters[status][$eq]=draft', ['filters[status][$eq]']],
    ['a richtext filter', 'filters[body][$contains]=x', ['filters[body][$contains]']],
    ['an unknown operator', 'filters[title][$like]=x', ['filters[title][$like]']],
    ['an operator the kind forbids', 'filters[featured][$gt]=true', ['filters[featured][$gt]']],
    ['a malformed filter key', 'filters[title]=x', ['filters[title]']],
    ['a nested filter key', 'filters[title][$eq][x]=x', ['filters[title][$eq][x]']],
    ['an empty filter value', 'filters[title][$eq]=', ['filters[title][$eq]']],
    [
      'a boolean value other than true/false',
      'filters[featured][$eq]=yes',
      ['filters[featured][$eq]'],
    ],
    ['a number value that is not a number', 'filters[views][$gt]=ten', ['filters[views][$gt]']],
    ['an id value that is not a number', 'filters[id][$eq]=x', ['filters[id][$eq]']],
    [
      'a date value that is not a date',
      'filters[createdAt][$gt]=soon',
      ['filters[createdAt][$gt]'],
    ],
    [
      'a filter value over 256 characters',
      `filters[title][$eq]=${'a'.repeat(257)}`,
      ['filters[title][$eq]'],
    ],
    ['a search over 256 characters', `q=${'a'.repeat(257)}`, ['q']],
    ['a prototype key as orderBy', 'orderBy=constructor', ['orderBy']],
    ['a prototype key as filter', 'filters[toString][$eq]=x', ['filters[toString][$eq]']],
  ])('drops %s and reports it', (_case, search, dropped) => {
    expect(parseListState(search, catalog)).toEqual({ state: DEFAULT_LIST_STATE, dropped });
  });

  it('keeps the first operator on a field and drops the second', () => {
    expect(parseListState('filters[views][$gt]=1&filters[views][$lt]=9', catalog)).toEqual({
      state: state({ filters: { views: { op: '$gt', value: '1' } } }),
      dropped: ['filters[views][$lt]'],
    });
  });

  it('keeps the first of a repeated param', () => {
    expect(parseListState('page=2&page=3&orderBy=title&orderBy=views', catalog).state).toEqual(
      state({ page: 2, orderBy: 'title' }),
    );
  });

  it('trims a filter value', () => {
    expect(parseListState('filters[title][$eq]=%20a%20', catalog).state.filters).toEqual({
      title: { op: '$eq', value: 'a' },
    });
  });

  it('keeps the valid params beside the dropped ones (AC-4 URL)', () => {
    expect(parseListState('?orderBy=coverImage&filters[nope][$eq]=1&page=2', catalog)).toEqual({
      state: state({ page: 2 }),
      dropped: ['orderBy', 'filters[nope][$eq]'],
    });
  });
});

describe('serializeListState (AC-3)', () => {
  it('drops every default', () => {
    expect(serializeListState(DEFAULT_LIST_STATE)).toBe('');
  });

  it('writes sorted keys, with readable filter brackets', () => {
    expect(
      serializeListState(
        state({
          page: 2,
          size: 50,
          orderBy: 'createdAt',
          sortDir: 'asc',
          q: 'a b&c',
          filters: {
            views: { op: '$gte', value: '3' },
            featured: { op: '$eq', value: 'true' },
          },
        }),
      ),
    ).toBe(
      'filters[featured][$eq]=true&filters[views][$gte]=3&orderBy=createdAt&page=2&q=a%20b%26c&size=50&sortDir=asc',
    );
  });

  it('encodes the brackets of a filter value but not of its key', () => {
    expect(serializeListState(state({ filters: { title: { op: '$eq', value: '[x]' } } }))).toBe(
      'filters[title][$eq]=%5Bx%5D',
    );
  });

  it('drops a blank search', () => {
    expect(serializeListState(state({ q: '   ' }))).toBe('');
  });
});

describe('round trip (AC-3)', () => {
  it.each([
    '',
    'page=0&size=7',
    'orderBy=coverImage&filters[nope][$eq]=1',
    'filters[views][$gt]=1&filters[views][$lt]=9&sortDir=asc',
    'q=%20%2Bplus%20&page=4&size=100&orderBy=featured',
    'filters%5Btitle%5D%5B%24contains%5D=caf%C3%A9&utm=1',
    'filters[createdAt][$gte]=2026-01-01T00:00:00.000Z&orderBy=updatedAt',
    'filters[documentId][$ne]=doc%201&filters[id][$eq]=3',
    'page=abc&size=&orderBy=&sortDir=&q=',
  ])('parse -> serialize -> parse is stable for %j', (search) => {
    const first = parseListState(search, catalog).state;
    const canonical = serializeListState(first);
    const second = parseListState(canonical, catalog);

    expect(second).toEqual({ state: first, dropped: [] });
    expect(serializeListState(second.state)).toBe(canonical);
  });
});

describe('toListParams', () => {
  it('maps the default state to empty params', () => {
    expect(toListParams(DEFAULT_LIST_STATE)).toEqual({});
  });

  it('computes start from the 1-based page and keeps the rest', () => {
    expect(
      toListParams(
        state({
          page: 3,
          size: 10,
          orderBy: 'title',
          sortDir: 'asc',
          q: ' hi ',
          filters: { featured: { op: '$eq', value: 'true' } },
        }),
      ),
    ).toEqual({
      start: 20,
      size: 10,
      orderBy: 'title',
      sortDir: 'asc',
      search: 'hi',
      filters: { featured: { $eq: 'true' } },
    });
  });
});

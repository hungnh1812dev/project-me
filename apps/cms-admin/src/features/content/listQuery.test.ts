import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import {
  listValidationError,
  MAX_LIST_TEXT_LENGTH,
  normalizeListParams,
  toListSearchParams,
  toWireField,
  validateListParams,
} from './listQuery';
import type { ListParams } from './types';

describe('normalizeListParams (AC-2)', () => {
  it.each<[string, ListParams, ListParams]>([
    ['keeps an empty object empty', {}, {}],
    ['drops undefined values', { start: undefined, size: undefined, search: undefined }, {}],
    ['drops the backend defaults', { start: 0, size: 20, orderBy: 'id', sortDir: 'desc' }, {}],
    [
      'keeps non-default values',
      { start: 40, size: 10, orderBy: 'title', sortDir: 'asc' },
      { start: 40, size: 10, orderBy: 'title', sortDir: 'asc' },
    ],
    ['trims search', { search: '  hello  ' }, { search: 'hello' }],
    ['drops an empty search', { search: '' }, {}],
    ['drops a whitespace-only search', { search: '   \t ' }, {}],
    ['drops an empty filters object', { filters: {} }, {}],
    ['drops a field with no operators', { filters: { title: {} } }, {}],
    ['drops an operator whose value is undefined', { filters: { title: { $eq: undefined } } }, {}],
    [
      'keeps falsy but defined filter values',
      { filters: { featured: { $eq: false }, views: { $gt: 0 } } },
      { filters: { featured: { $eq: false }, views: { $gt: 0 } } },
    ],
  ])('%s', (_case, input, expected) => {
    expect(normalizeListParams(input)).toEqual(expected);
  });

  it('sorts the filter keys', () => {
    const out = normalizeListParams({
      filters: { views: { $gte: 1 }, author: { $eq: 'x' }, title: { $contains: 'a' } },
    });

    expect(Object.keys(out.filters ?? {})).toEqual(['author', 'title', 'views']);
  });

  it('sorts the operators within a field', () => {
    const out = normalizeListParams({ filters: { views: { $gt: 1, $lt: 9, $eq: 5 } } });

    expect(Object.keys(out.filters?.views ?? {})).toEqual(['$eq', '$gt', '$lt']);
  });

  it('drops a field whose operator map is missing at runtime', () => {
    const input = { filters: { title: undefined, views: { $gt: 1 } } } as unknown as ListParams;

    expect(normalizeListParams(input)).toEqual({ filters: { views: { $gt: 1 } } });
  });

  it('maps equal inputs to deep-equal outputs', () => {
    const a = normalizeListParams({});
    const b = normalizeListParams({ start: 0, size: 20, search: ' ', filters: {} });
    const c = normalizeListParams({ filters: { b: { $eq: 1 }, a: { $eq: 2 } }, search: 'x ' });
    const d = normalizeListParams({ search: ' x', filters: { a: { $eq: 2 }, b: { $eq: 1 } } });

    expect(a).toEqual(b);
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
  });

  it('does not mutate its input', () => {
    const input: ListParams = { search: ' a ', filters: { b: { $eq: 1 }, a: {} } };
    const snapshot = structuredClone(input);

    normalizeListParams(input);

    expect(input).toEqual(snapshot);
  });
});

describe('toWireField (AC-4)', () => {
  it.each([
    ['id', 'id'],
    ['documentId', 'document_id'],
    ['createdAt', 'created_at'],
    ['updatedAt', 'updated_at'],
    ['publishedAt', 'published_at'],
    ['title', 'title'],
    ['created_at', 'created_at'],
    ['isFeatured', 'isFeatured'],
  ])('maps %s to %s', (field, wire) => {
    expect(toWireField(field)).toBe(wire);
  });
});

describe('toListSearchParams (AC-3, AC-4)', () => {
  const serialize = (params: ListParams) => toListSearchParams(normalizeListParams(params));

  it('serializes nothing for the defaults', () => {
    expect(serialize({}).toString()).toBe('');
    expect(serialize({ start: 0, size: 20 }).toString()).toBe('');
  });

  it('writes start, size, orderBy, sortDir, search, then filters, in that order', () => {
    const qs = serialize({
      filters: { title: { $contains: 'eng' } },
      search: 'hello',
      sortDir: 'asc',
      orderBy: 'title',
      size: 50,
      start: 100,
    });

    expect([...qs.entries()]).toEqual([
      ['start', '100'],
      ['size', '50'],
      ['orderBy', 'title'],
      ['sortDir', 'asc'],
      ['search', 'hello'],
      ['filters[title][$contains]', 'eng'],
    ]);
  });

  it('writes filters in sorted field order', () => {
    const qs = serialize({ filters: { views: { $gte: 18 }, featured: { $eq: true } } });

    expect([...qs.keys()]).toEqual(['filters[featured][$eq]', 'filters[views][$gte]']);
  });

  it.each<[string, ListParams, [string, string]]>([
    [
      'a boolean true',
      { filters: { featured: { $eq: true } } },
      ['filters[featured][$eq]', 'true'],
    ],
    [
      'a boolean false',
      { filters: { featured: { $ne: false } } },
      ['filters[featured][$ne]', 'false'],
    ],
    ['a number', { filters: { views: { $gte: 18 } } }, ['filters[views][$gte]', '18']],
    ['a zero', { filters: { views: { $eq: 0 } } }, ['filters[views][$eq]', '0']],
    ['a string', { filters: { title: { $eq: 'a b' } } }, ['filters[title][$eq]', 'a b']],
    [
      'a Date',
      { filters: { createdAt: { $gt: new Date('2026-02-03T04:05:06.000Z') } } },
      ['filters[created_at][$gt]', '2026-02-03T04:05:06.000Z'],
    ],
  ])('serializes %s', (_case, params, entry) => {
    expect([...serialize(params).entries()]).toEqual([entry]);
  });

  it.each([
    ['documentId', 'document_id'],
    ['createdAt', 'created_at'],
    ['updatedAt', 'updated_at'],
    ['publishedAt', 'published_at'],
    ['id', 'id'],
    ['title', 'title'],
  ])('maps orderBy %s to %s on the wire', (field, wire) => {
    // Serialized without normalizing, so the default `id` is not dropped.
    expect(toListSearchParams({ orderBy: field }).get('orderBy')).toBe(wire);
  });

  it('maps camelCase system columns in filter keys', () => {
    const qs = serialize({ filters: { documentId: { $eq: 'doc-1' }, updatedAt: { $lt: 'x' } } });

    expect([...qs.keys()]).toEqual(['filters[document_id][$eq]', 'filters[updated_at][$lt]']);
  });

  it('encodes values in the query string, so they cannot inject params', () => {
    const qs = serialize({ search: 'a&size=1', filters: { title: { $eq: 'x#y' } } });

    expect(qs.get('size')).toBeNull();
    expect(qs.get('search')).toBe('a&size=1');
    expect(qs.toString()).toContain('search=a%26size%3D1');
  });
});

describe('validateListParams (AC-5)', () => {
  it.each<[string, ListParams]>([
    ['empty params', {}],
    ['the bounds', { start: 0, size: 1 }],
    ['the upper size bound', { size: 100, sortDir: 'desc' }],
    ['one operator per field', { filters: { a: { $eq: 1 }, b: { $contains: 'x' } } }],
    [
      'every known operator',
      { filters: { a: { $ne: 1 }, b: { $gt: 1 }, c: { $gte: 1 }, d: { $lt: 1 }, e: { $lte: 1 } } },
    ],
    ['an operator with an undefined sibling', { filters: { a: { $eq: 1, $ne: undefined } } }],
  ])('accepts %s', (_case, params) => {
    expect(validateListParams(params)).toEqual([]);
  });

  it.each<[string, unknown, RegExp]>([
    ['a negative start', { start: -1 }, /start/],
    ['a fractional start', { start: 1.5 }, /start/],
    ['a NaN start', { start: Number.NaN }, /start/],
    ['a zero size', { size: 0 }, /size/],
    ['a size above 100', { size: 101 }, /size/],
    ['a fractional size', { size: 10.5 }, /size/],
    ['an unknown sortDir', { sortDir: 'up' }, /sortDir/],
    ['an unknown operator', { filters: { title: { $like: 'x' } } }, /\$like.*title|title.*\$like/],
    ['two operators on a field', { filters: { views: { $gt: 1, $lt: 5 } } }, /views/],
  ])('flags %s', (_case, params, pattern) => {
    const problems = validateListParams(params as ListParams);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
  });

  it('ignores a field whose operator map is missing at runtime', () => {
    const params = { filters: { title: undefined } } as unknown as ListParams;

    expect(validateListParams(params)).toEqual([]);
  });

  it('reports every violation at once', () => {
    const problems = validateListParams({
      start: -1,
      size: 500,
      sortDir: 'sideways',
      filters: { a: { $bad: 1 }, b: { $eq: 1, $ne: 2 } },
    } as unknown as ListParams);

    expect(problems).toHaveLength(5);
  });
});

describe('validateListParams: plain identifiers (P2-SEC-1, AC-1, AC-2)', () => {
  it.each(['id', 'createdAt', 'title', 'published_at', '_private', 'a'.repeat(64)])(
    'accepts orderBy %s',
    (orderBy) => {
      expect(validateListParams({ orderBy })).toEqual([]);
    },
  );

  it.each(['x][$ne', 'a b', 'created_at;', '', '1title', 'a'.repeat(65), 'title.raw', 'tïtle'])(
    'flags orderBy %j',
    (orderBy) => {
      const problems = validateListParams({ orderBy });

      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/orderBy must be a plain field name/);
    },
  );

  it.each(['x][$ne', 'a b', 'created_at;', '', 'a'.repeat(65)])('flags filter key %j', (key) => {
    const problems = validateListParams({ filters: { [key]: { $eq: 1 } } });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/filter field must be a plain field name/);
  });

  it('accepts valid filter keys and keeps the operator rules', () => {
    expect(
      validateListParams({ filters: { createdAt: { $gt: 1 }, published_at: { $lt: 2 } } }),
    ).toEqual([]);
    expect(validateListParams({ filters: { title: { $eq: 'a', $ne: 'b' } } })).toHaveLength(1);
  });
});

describe('validateListParams: length caps (P2-SEC-2, AC-5, AC-6)', () => {
  it('caps at 256 characters', () => {
    expect(MAX_LIST_TEXT_LENGTH).toBe(256);
  });

  it('accepts a 256-character search, measured after trimming', () => {
    expect(validateListParams({ search: 'a'.repeat(256) })).toEqual([]);
    expect(validateListParams({ search: `  ${'a'.repeat(256)}  ` })).toEqual([]);
  });

  it('flags a search over 256 characters after trimming', () => {
    const problems = validateListParams({ search: ` ${'a'.repeat(257)} ` });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/search/);
  });

  it('accepts a 256-character string filter value', () => {
    expect(validateListParams({ filters: { title: { $contains: 'a'.repeat(256) } } })).toEqual([]);
  });

  it('flags a string filter value over 256 characters', () => {
    const problems = validateListParams({ filters: { title: { $contains: 'a'.repeat(257) } } });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/title/);
  });

  it('leaves numbers, booleans and dates alone', () => {
    expect(
      validateListParams({
        filters: {
          views: { $gt: 10 ** 300 },
          featured: { $eq: true },
          createdAt: { $gte: new Date('2026-01-01T00:00:00Z') },
        },
      }),
    ).toEqual([]);
  });
});

describe('listValidationError (AC-5)', () => {
  it('builds a 400 ERR_CLIENT_VALIDATION ApiError carrying every problem', () => {
    const error = listValidationError(['start is bad', 'size is bad']);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('ERR_CLIENT_VALIDATION');
    expect(error.messages).toEqual(['start is bad', 'size is bad']);
    expect(error.message).toBe('start is bad, size is bad');
  });
});

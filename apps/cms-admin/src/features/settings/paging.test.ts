import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGING, PAGE_SIZES, parsePaging, serializePaging } from './paging';

describe('parsePaging (AC-24)', () => {
  it('defaults to page 1 and 10 rows when the URL has neither', () => {
    expect(parsePaging('')).toEqual({ page: 1, size: 10 });
    expect(DEFAULT_PAGING).toEqual({ page: 1, size: 10 });
  });

  it('offers 10, 20, 50 and 100 rows per page', () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
  });

  it('reads a valid page and size', () => {
    expect(parsePaging('page=3&size=50')).toEqual({ page: 3, size: 50 });
    expect(parsePaging(new URLSearchParams('size=100&page=2'))).toEqual({ page: 2, size: 100 });
  });

  it.each(['0', '-1', '1.5', 'abc', '', '01', '1e3', '1234567890'])(
    'falls back to page 1 for page=%s',
    (raw) => {
      expect(parsePaging(`page=${raw}`).page).toBe(1);
    },
  );

  it.each(['0', '15', '25', 'abc', '', '10.0'])('falls back to 10 rows for size=%s', (raw) => {
    expect(parsePaging(`size=${raw}`).size).toBe(10);
  });

  it('uses the first of a repeated param', () => {
    expect(parsePaging('page=2&page=5&size=20&size=50')).toEqual({ page: 2, size: 20 });
  });
});

describe('serializePaging (AC-24)', () => {
  it('omits page and size at their defaults', () => {
    expect(serializePaging({ page: 1, size: 10 }).toString()).toBe('');
  });

  it('writes page and size when they differ from the defaults', () => {
    expect(serializePaging({ page: 2, size: 20 }).toString()).toBe('page=2&size=20');
  });

  it('keeps the other params and replaces stale page and size values', () => {
    const base = new URLSearchParams('tab=x&page=9&size=abc&page=4');
    expect(serializePaging({ page: 1, size: 50 }, base).toString()).toBe('tab=x&size=50');
    expect(serializePaging({ page: 3, size: 10 }, base).toString()).toBe('tab=x&page=3');
    // The base is not changed.
    expect(base.toString()).toBe('tab=x&page=9&size=abc&page=4');
  });

  it('keeps the position of params already in the URL', () => {
    const base = new URLSearchParams('page=2&tab=x');
    expect(serializePaging({ page: 2, size: 10 }, base).toString()).toBe('page=2&tab=x');
  });

  it('round-trips with parsePaging', () => {
    const paging = { page: 7, size: 100 } as const;
    expect(parsePaging(serializePaging(paging))).toEqual(paging);
  });
});

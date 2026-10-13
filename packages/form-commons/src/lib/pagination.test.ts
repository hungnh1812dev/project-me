import { describe, expect, it } from 'vitest';

import { clampPage, lastPage, pageSlice } from './pagination';

describe('lastPage', () => {
  it('is the number of pages, rounding a partial page up', () => {
    expect(lastPage(95, 20)).toBe(5);
    expect(lastPage(100, 20)).toBe(5);
    expect(lastPage(101, 20)).toBe(6);
  });

  it('is 1 for an empty list', () => {
    expect(lastPage(0, 10)).toBe(1);
  });
});

describe('clampPage', () => {
  it('keeps a page that is in range', () => {
    expect(clampPage(2, 25, 10)).toBe(2);
  });

  it('moves a page past the end to the last page', () => {
    expect(clampPage(4, 25, 10)).toBe(3);
  });

  it('moves a page below 1 to page 1', () => {
    expect(clampPage(0, 25, 10)).toBe(1);
    expect(clampPage(-3, 25, 10)).toBe(1);
  });

  it('is page 1 for an empty list', () => {
    expect(clampPage(3, 0, 10)).toBe(1);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns the items of a full page', () => {
    expect(pageSlice(items, 2, 10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('returns the rest on a partial last page', () => {
    expect(pageSlice(items, 3, 10)).toEqual([21, 22, 23, 24, 25]);
  });

  it('returns nothing for a page past the end', () => {
    expect(pageSlice(items, 4, 10)).toEqual([]);
  });

  it('does not change the input', () => {
    const copy = [...items];
    pageSlice(items, 1, 10);
    expect(items).toEqual(copy);
  });
});

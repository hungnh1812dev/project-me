import { describe, expect, it } from 'vitest';

import { makeContentType } from '@/test/contentFixtures';

import { buildColumnCatalog } from './columns';
import { filterChipLabel, operatorLabel } from './filterLabels';

const CATALOG = buildColumnCatalog(makeContentType());
const DAY = new Date(2026, 0, 15).toISOString();

describe('operatorLabel', () => {
  it('reads range operators as before and after on dates', () => {
    expect(operatorLabel('date', '$gt')).toBe('is after');
    expect(operatorLabel('date', '$gte')).toBe('is on or after');
    expect(operatorLabel('date', '$lt')).toBe('is before');
    expect(operatorLabel('date', '$lte')).toBe('is on or before');
    expect(operatorLabel('date', '$eq')).toBe('is');
  });

  it('reads range operators as comparisons on numbers', () => {
    expect(operatorLabel('number', '$gt')).toBe('is greater than');
    expect(operatorLabel('number', '$gte')).toBe('is at least');
    expect(operatorLabel('number', '$lt')).toBe('is less than');
    expect(operatorLabel('number', '$lte')).toBe('is at most');
    expect(operatorLabel('text', '$ne')).toBe('is not');
    expect(operatorLabel('text', '$contains')).toBe('contains');
  });
});

describe('filterChipLabel (AC-22)', () => {
  it('shows a boolean as Yes or No', () => {
    expect(filterChipLabel(CATALOG, 'featured', { op: '$eq', value: 'true' }, 'en-US')).toBe(
      'Featured is Yes',
    );
    expect(filterChipLabel(CATALOG, 'featured', { op: '$ne', value: 'false' }, 'en-US')).toBe(
      'Featured is not No',
    );
  });

  it('formats a number for the locale', () => {
    expect(filterChipLabel(CATALOG, 'views', { op: '$lte', value: '1500' }, 'en-US')).toBe(
      'Views is at most 1,500',
    );
  });

  it('quotes text', () => {
    expect(filterChipLabel(CATALOG, 'title', { op: '$contains', value: 'hi' }, 'en-US')).toBe(
      'Title contains “hi”',
    );
  });

  it('shows a date as the day', () => {
    expect(filterChipLabel(CATALOG, 'createdAt', { op: '$gt', value: DAY }, 'en-US')).toBe(
      'Created is after Jan 15, 2026',
    );
  });

  it('falls back to the raw key and value for an unknown column', () => {
    expect(filterChipLabel(CATALOG, 'nope', { op: '$eq', value: 'x' })).toBe('nope is x');
  });
});

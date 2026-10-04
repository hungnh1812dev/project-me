import { describe, expect, it } from 'vitest';

import { filterBySearch } from './search';

interface Row {
  email: string;
  name: string;
  username: string | null;
  level?: number;
}

const ROWS: Row[] = [
  { email: 'jane@example.com', name: 'Jane Doe', username: 'jane' },
  { email: 'john@example.com', name: 'John Smith', username: null },
  { email: 'ann@test.dev', name: 'Ann Lee', username: 'ann', level: 50 },
];

describe('filterBySearch (AC-4)', () => {
  it.each([
    ['an empty query', ''],
    ['a whitespace-only query', '   '],
  ])('returns every item for %s', (_, query) => {
    expect(filterBySearch(ROWS, query, ['email', 'name'])).toEqual(ROWS);
  });

  it.each([
    ['matches case-insensitively', 'JANE', ['jane@example.com']],
    ['trims the query', '  smith ', ['john@example.com']],
    ['matches inside a value', 'example', ['jane@example.com', 'john@example.com']],
    ['matches any listed field', 'lee', ['ann@test.dev']],
    ['returns nothing when nothing matches', 'zzz', []],
  ])('%s', (_, query, emails) => {
    expect(filterBySearch(ROWS, query, ['email', 'name']).map((row) => row.email)).toEqual(emails);
  });

  it('only searches the given fields', () => {
    expect(filterBySearch(ROWS, 'Doe', ['email'])).toEqual([]);
  });

  it('skips null and missing values and matches numbers as text', () => {
    expect(filterBySearch(ROWS, 'ann', ['username']).map((row) => row.email)).toEqual([
      'ann@test.dev',
    ]);
    expect(filterBySearch(ROWS, '50', ['level']).map((row) => row.email)).toEqual(['ann@test.dev']);
  });

  it('does not mutate the input', () => {
    const copy = [...ROWS];

    filterBySearch(ROWS, 'jane', ['email']);

    expect(ROWS).toEqual(copy);
  });
});

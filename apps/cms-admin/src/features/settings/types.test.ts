import { describe, expect, it } from 'vitest';

import { EXPIRES_IN_OPTIONS, expiresInLabel } from './types';

describe('EXPIRES_IN_OPTIONS', () => {
  it('lists every backend value in order with its label (D6: 1m is one month)', () => {
    expect(EXPIRES_IN_OPTIONS).toEqual([
      { value: '30m', label: '30 minutes' },
      { value: '1h', label: '1 hour' },
      { value: '1d', label: '1 day' },
      { value: '1m', label: '1 month' },
      { value: '1y', label: '1 year' },
      { value: 'never', label: 'Never' },
    ]);
  });

  it('looks up a label by value', () => {
    expect(expiresInLabel('1m')).toBe('1 month');
    expect(expiresInLabel('never')).toBe('Never');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readFlag, SIDEBAR_OPEN_KEY, sidebarGroupKey, writeFlag } from './sidebarState';

afterEach(() => {
  window.localStorage.clear();
});

describe('sidebarState', () => {
  it('names the storage keys under the app prefix', () => {
    expect(SIDEBAR_OPEN_KEY).toBe('cms-admin:sidebar:open');
    expect(sidebarGroupKey('content')).toBe('cms-admin:sidebar:group:content');
  });

  it('falls back when nothing is stored', () => {
    expect(readFlag('test:flag-missing', true)).toBe(true);
    expect(readFlag('test:flag-missing', false)).toBe(false);
  });

  it('round-trips true and false', () => {
    writeFlag('test:flag', false);
    expect(window.localStorage.getItem('test:flag')).toBe('false');
    expect(readFlag('test:flag', true)).toBe(false);

    writeFlag('test:flag', true);
    expect(readFlag('test:flag', false)).toBe(true);
  });

  it('ignores a value it did not write', () => {
    window.localStorage.setItem('test:flag-junk', 'maybe');

    expect(readFlag('test:flag-junk', true)).toBe(true);
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readFlag('test:flag-blocked', true)).toBe(true);
  });
});

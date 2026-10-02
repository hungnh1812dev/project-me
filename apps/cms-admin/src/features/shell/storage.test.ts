import { describe, expect, it, vi } from 'vitest';

import { readStorage, writeStorage } from './storage';

describe('storage', () => {
  it('writes to and reads from localStorage', () => {
    writeStorage('test:plain', 'value');

    expect(window.localStorage.getItem('test:plain')).toBe('value');
    expect(readStorage('test:plain')).toBe('value');
  });

  it('returns null for a missing key', () => {
    expect(readStorage('test:missing')).toBeNull();
  });

  it('returns null when reading throws and nothing was kept in memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readStorage('test:blocked-read')).toBeNull();
  });

  it('keeps the value in memory when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => writeStorage('test:blocked', 'kept')).not.toThrow();
    expect(readStorage('test:blocked')).toBe('kept');
  });

  it('prefers the in-memory value over a stale stored value after a failed write', () => {
    window.localStorage.setItem('test:stale', 'old');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    writeStorage('test:stale', 'new');

    expect(readStorage('test:stale')).toBe('new');
  });

  it('drops the in-memory value once a later write succeeds', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    writeStorage('test:recover', 'memory');
    setItem.mockRestore();

    writeStorage('test:recover', 'stored');
    window.localStorage.setItem('test:recover', 'changed-elsewhere');

    expect(readStorage('test:recover')).toBe('changed-elsewhere');
  });

  it('falls back to memory when localStorage itself is not accessible', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    writeStorage('test:no-access', 'mem');

    expect(readStorage('test:no-access')).toBe('mem');
  });
});

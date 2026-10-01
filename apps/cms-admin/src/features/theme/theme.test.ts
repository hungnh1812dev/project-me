import { describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  isThemeChoice,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredTheme,
} from './theme';

describe('THEME_STORAGE_KEY', () => {
  it('is cms-admin:theme', () => {
    expect(THEME_STORAGE_KEY).toBe('cms-admin:theme');
  });
});

describe('isThemeChoice', () => {
  it.each(['light', 'dark', 'system'])('accepts %j', (value) => {
    expect(isThemeChoice(value)).toBe(true);
  });

  it.each([null, undefined, '', 'Dark', 'blue', 1])('rejects %j', (value) => {
    expect(isThemeChoice(value)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
    [null, false, 'light'],
    [null, true, 'dark'],
    ['nonsense', false, 'light'],
    ['nonsense', true, 'dark'],
  ] as const)('stored %j with systemDark=%j resolves to %j', (stored, systemDark, expected) => {
    expect(resolveTheme(stored, systemDark)).toBe(expected);
  });
});

describe('readStoredTheme', () => {
  it('defaults to system when nothing is stored', () => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);

    expect(readStoredTheme()).toBe('system');
  });

  it('returns a valid stored choice', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(readStoredTheme()).toBe('dark');
  });

  it('falls back to system for an invalid stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');

    expect(readStoredTheme()).toBe('system');
  });

  it('falls back to system when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readStoredTheme()).toBe('system');
  });
});

describe('writeStoredTheme', () => {
  it('persists the choice under the theme key', () => {
    writeStoredTheme('light');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => writeStoredTheme('dark')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('adds the dark class and dark colour scheme', () => {
    const root = document.createElement('html');

    applyTheme('dark', root);

    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
  });

  it('removes the dark class for light', () => {
    const root = document.createElement('html');
    root.classList.add('dark');

    applyTheme('light', root);

    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });

  it('defaults to document.documentElement', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

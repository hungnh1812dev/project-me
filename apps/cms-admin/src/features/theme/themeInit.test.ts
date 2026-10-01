/// <reference types="node" />
// Runs public/theme-init.js (the pre-paint script) against jsdom and checks it mirrors resolveTheme.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveTheme, THEME_STORAGE_KEY } from './theme';

const source = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
const runThemeInit = () => new Function(source)();
const root = document.documentElement;

function mockSystemDark(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: dark } as MediaQueryList);
}

afterEach(() => {
  window.localStorage.clear();
  root.classList.remove('dark');
  root.style.colorScheme = '';
});

describe('public/theme-init.js', () => {
  it.each([
    ['light', false],
    ['light', true],
    ['dark', false],
    ['dark', true],
    ['system', false],
    ['system', true],
    [null, false],
    [null, true],
    ['nonsense', true],
  ] as const)('stored %j with systemDark=%j matches resolveTheme', (stored, systemDark) => {
    if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    mockSystemDark(systemDark);

    runThemeInit();

    const expected = resolveTheme(stored, systemDark);
    expect(root.classList.contains('dark')).toBe(expected === 'dark');
    expect(root.style.colorScheme).toBe(expected);
  });

  it('follows the OS and does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    mockSystemDark(true);

    expect(runThemeInit).not.toThrow();
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('does not throw without matchMedia', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('not supported');
    });

    expect(runThemeInit).not.toThrow();
  });
});

import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from './theme';
import ThemeProvider from './ThemeProvider';
import { useTheme } from './useTheme';

/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystemDark(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) =>
      listeners.delete(cb),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);
  return {
    listeners,
    set(dark: boolean) {
      mql.matches = dark;
      act(() => listeners.forEach((cb) => cb({ matches: dark } as MediaQueryListEvent)));
    },
  };
}

const Probe: React.FC = () => {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <div>
      <p>
        {choice}/{resolved}
      </p>
      <button type="button" onClick={() => setChoice('dark')}>
        Dark
      </button>
      <button type="button" onClick={() => setChoice('light')}>
        Light
      </button>
      <button type="button" onClick={() => setChoice('system')}>
        System
      </button>
    </div>
  );
};

const isDark = () => document.documentElement.classList.contains('dark');

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('ThemeProvider', () => {
  it('defaults to System and follows the OS setting', () => {
    mockSystemDark(true);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByText('system/dark')).toBeInTheDocument();
    expect(isDark()).toBe(true);
  });

  it('starts from the stored choice', () => {
    mockSystemDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByText('light/light')).toBeInTheDocument();
    expect(isDark()).toBe(false);
  });

  it('applies and persists a new choice', async () => {
    mockSystemDark(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(screen.getByText('dark/dark')).toBeInTheDocument();
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('applies OS changes live in System mode', () => {
    const system = mockSystemDark(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(isDark()).toBe(false);

    system.set(true);

    expect(screen.getByText('system/dark')).toBeInTheDocument();
    expect(isDark()).toBe(true);
  });

  it('ignores OS changes when the choice is explicit', async () => {
    const system = mockSystemDark(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Light' }));

    system.set(true);

    expect(screen.getByText('light/light')).toBeInTheDocument();
    expect(isDark()).toBe(false);
  });

  it('stops listening to the OS on unmount', () => {
    const system = mockSystemDark(false);
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    unmount();

    expect(system.listeners.size).toBe(0);
  });

  it('follows the OS and does not throw when localStorage is unavailable', async () => {
    mockSystemDark(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByText('system/dark')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Light' }));

    expect(screen.getByText('light/light')).toBeInTheDocument();
    expect(isDark()).toBe(false);
  });
});

describe('useTheme', () => {
  it('throws outside ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });
});

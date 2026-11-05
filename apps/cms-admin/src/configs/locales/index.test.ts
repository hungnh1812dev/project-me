import { createElement, Suspense } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, loadScreenText, preloadScreenText, useScreenText } from '.';
import { EN_TEXT } from './en';

const omitNav = ({ nav: _nav, ...rest }: typeof EN_TEXT.access) => rest;

describe('loadScreenText', () => {
  it('uses en as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it.each([
    ['access', { access: omitNav(EN_TEXT.access) }],
    ['backups', { backups: EN_TEXT.backups }],
    ['content', { content: EN_TEXT.content }],
    ['login', { login: EN_TEXT.login }],
    ['media', { media: EN_TEXT.media }],
    ['reviewer', { reviewer: EN_TEXT.reviewer }],
    ['security', { security: EN_TEXT.security }],
    ['setup', { setup: EN_TEXT.setup }],
    ['status', { page: EN_TEXT.page, status: EN_TEXT.status }],
  ] as const)('loads the %s screen as its slice of EN_TEXT', async (name, expected) => {
    const loaded = await loadScreenText(name);
    expect(Object.keys(loaded)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) {
      expect((loaded as Record<string, unknown>)[key]).toEqual(
        (expected as Record<string, unknown>)[key],
      );
    }
  });

  it('returns the same promise for the same screen and locale', () => {
    expect(loadScreenText('login')).toBe(loadScreenText('login', 'en'));
  });

  it('keeps a failed load cached until it is retried', async () => {
    vi.resetModules();
    vi.doMock('./en/Setup', () => ({
      get SETUP_COPY(): never {
        throw new Error('chunk failed');
      },
    }));
    const fresh = await import('.');
    await expect(fresh.loadScreenText('setup')).rejects.toThrow('chunk failed');
    await expect(fresh.loadScreenText('setup')).rejects.toThrow('chunk failed');
    vi.doUnmock('./en/Setup');
    fresh.retryFailedScreenText(['setup']);
    const again = await fresh.loadScreenText('setup');
    expect(again.setup).toBeDefined();
  });
});

describe('useScreenText', () => {
  const LoginTitle = () => createElement('p', null, useScreenText('login').login.title);

  it('renders a preloaded screen without a fallback', async () => {
    await preloadScreenText(['login']);
    render(
      createElement(
        Suspense,
        { fallback: createElement('p', null, 'fallback') },
        createElement(LoginTitle),
      ),
    );
    expect(screen.queryByText('fallback')).toBeNull();
    expect(screen.getByText(EN_TEXT.login.title)).toBeTruthy();
  });

  it('reads a fulfilled load as its value, without calling use', async () => {
    await preloadScreenText(['login']);
    const loading = loadScreenText('login') as unknown as { status: string; value: unknown };
    expect(loading.status).toBe('fulfilled');
    const { result } = renderHook(() => useScreenText('login'));
    expect(result.current).toBe(loading.value);
  });

  it('still suspends while a load is unsettled', async () => {
    vi.resetModules();
    const fresh = await import('.');
    const Probe = () => createElement('p', null, fresh.useScreenText('backups').backups.title);
    render(
      createElement(
        Suspense,
        { fallback: createElement('p', null, 'fallback') },
        createElement(Probe),
      ),
    );
    expect(screen.getByText('fallback')).toBeTruthy();
    expect(screen.queryByText(EN_TEXT.backups.title)).toBeNull();
  });
});

import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { formatPageTitle, usePageTitleAndFocus } from './usePageTitleAndFocus';

describe('formatPageTitle', () => {
  it.each([
    ['Your profile', 'Your profile · CMS Admin'],
    ['  Article  ', 'Article · CMS Admin'],
    ['', 'CMS Admin'],
    [null, 'CMS Admin'],
    [undefined, 'CMS Admin'],
  ])('%j gives %j', (heading, expected) => {
    expect(formatPageTitle(heading)).toBe(expected);
  });
});

describe('usePageTitleAndFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.title = 'CMS Admin';
  });

  it('keeps focus on first load under StrictMode, where effects run twice', () => {
    const main = document.createElement('main');
    main.innerHTML = '<h1>Welcome</h1>';
    document.body.append(main);

    renderHook(() => usePageTitleAndFocus({ current: main }), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/admin']}>{children}</MemoryRouter>
      ),
      reactStrictMode: true,
    });

    expect(document.title).toBe('Welcome · CMS Admin');
    expect(document.body).toHaveFocus();
  });

  it('does nothing without a main element', () => {
    renderHook(() => usePageTitleAndFocus({ current: null }), { wrapper: MemoryRouter });

    expect(document.title).toBe('CMS Admin');
  });
});

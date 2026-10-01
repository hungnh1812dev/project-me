import { describe, expect, it } from 'vitest';

import { DEFAULT_AFTER_LOGIN, redirectTarget, toRedirectState } from './redirect';

describe('toRedirectState', () => {
  it('keeps the path, query and hash of the location', () => {
    expect(toRedirectState({ pathname: '/admin/profile', search: '?tab=1', hash: '#top' })).toEqual(
      { from: '/admin/profile?tab=1#top' },
    );
  });
});

describe('redirectTarget', () => {
  it('returns `from` when it is an in-app path', () => {
    expect(redirectTarget({ from: '/admin/profile' })).toBe('/admin/profile');
  });

  it('falls back to /admin when there is no state', () => {
    expect(redirectTarget(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(redirectTarget(undefined)).toBe('/admin');
  });

  it('falls back to /admin when `from` is not a string', () => {
    expect(redirectTarget({ from: 42 })).toBe('/admin');
    expect(redirectTarget('nope')).toBe('/admin');
  });

  it('rejects paths that would leave the app', () => {
    expect(redirectTarget({ from: '//evil.example' })).toBe('/admin');
    expect(redirectTarget({ from: '/\\evil.example' })).toBe('/admin');
    expect(redirectTarget({ from: 'https://evil.example' })).toBe('/admin');
  });

  it('never sends the user back to the login page', () => {
    expect(redirectTarget({ from: '/login?x=1' })).toBe('/admin');
  });
});

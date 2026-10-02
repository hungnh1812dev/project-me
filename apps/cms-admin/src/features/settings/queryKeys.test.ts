import { describe, expect, it } from 'vitest';

import { settingsKeys } from './queryKeys';

describe('settingsKeys (AC-11)', () => {
  it('produces the keys in the spec', () => {
    expect(settingsKeys.all).toEqual(['settings']);
    expect(settingsKeys.users()).toEqual(['settings', 'users']);
    expect(settingsKeys.roles()).toEqual(['settings', 'roles']);
    expect(settingsKeys.permissions()).toEqual(['settings', 'permissions']);
    expect(settingsKeys.accessTokens()).toEqual(['settings', 'accessTokens']);
    expect(settingsKeys.media()).toEqual(['settings', 'media']);
  });

  it('puts every list key under the settings root, so one prefix clears them all', () => {
    const lists = [
      settingsKeys.users(),
      settingsKeys.roles(),
      settingsKeys.permissions(),
      settingsKeys.accessTokens(),
      settingsKeys.media(),
    ];

    for (const key of lists) expect(key[0]).toBe(settingsKeys.all[0]);
    expect(new Set(lists.map((key) => key[1])).size).toBe(lists.length);
  });
});

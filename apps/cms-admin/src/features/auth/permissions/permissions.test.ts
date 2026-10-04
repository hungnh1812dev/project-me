import { describe, expect, it } from 'vitest';

import { makeRole } from '@/test/fixtures';

import {
  hasAllPermissions,
  hasAnyPermission,
  hasMinLevel,
  hasPermission,
  hasRole,
  ROLE_LEVEL,
} from './permissions';

describe('hasPermission', () => {
  it.each([
    ['an exact global match', ['media:read'], 'media:read', true],
    ['an exact scoped match', ['document:read:blog'], 'document:read:blog', true],
    ['a missing slug', ['media:read'], 'media:manager', false],
    ['manager satisfies read', ['media:manager'], 'media:read', true],
    ['manager does not satisfy other actions', ['user:manager'], 'user:role_manager', false],
    ['read does not satisfy manager', ['media:read'], 'media:manager', false],
    ['manager of another resource', ['role:manager'], 'media:read', false],
    ['global document satisfies scoped', ['document:update'], 'document:update:blog', true],
    ['global document of another action', ['document:read'], 'document:update:blog', false],
    ['scoped document does not satisfy global', ['document:read:blog'], 'document:read', false],
    ['scoped document of another type', ['document:read:blog'], 'document:read:news', false],
    ['a scope on a non-document resource', ['media:read'], 'media:read:x', false],
    ['an empty grant list', [], 'media:read', false],
  ])('%s', (_case, granted, required, expected) => {
    expect(hasPermission(granted, required)).toBe(expected);
  });

  it.each(['', 'media', 'media:', ':read', 'document::blog', 'document:read:', 'a:b:c:d'])(
    'treats the malformed slug %j as not granted, even when it is in the list',
    (slug) => {
      expect(hasPermission([slug, 'media:manager', 'document:read'], slug)).toBe(false);
    },
  );
});

describe('hasAllPermissions', () => {
  it('passes for an empty requirement', () => {
    expect(hasAllPermissions([], [])).toBe(true);
  });

  it('passes when every slug is satisfied', () => {
    expect(hasAllPermissions(['media:manager', 'role:read'], ['media:read', 'role:read'])).toBe(
      true,
    );
  });

  it('fails when one slug is missing', () => {
    expect(hasAllPermissions(['media:read'], ['media:read', 'role:read'])).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('fails for an empty requirement', () => {
    expect(hasAnyPermission(['media:read'], [])).toBe(false);
  });

  it('passes when one slug is satisfied', () => {
    expect(hasAnyPermission(['document:read'], ['media:read', 'document:read:blog'])).toBe(true);
  });

  it('fails when no slug is satisfied', () => {
    expect(hasAnyPermission(['role:read'], ['media:read', 'user:read'])).toBe(false);
  });
});

describe('ROLE_LEVEL', () => {
  it('names the admin and super admin floors only', () => {
    expect(ROLE_LEVEL).toEqual({ ADMIN: 50, SUPER_ADMIN: 100 });
  });
});

describe('hasRole', () => {
  it('matches a single slug', () => {
    expect(hasRole(makeRole({ slug: 'editor' }), 'editor')).toBe(true);
    expect(hasRole(makeRole({ slug: 'editor' }), 'admin')).toBe(false);
  });

  it('matches any slug of a list', () => {
    expect(hasRole(makeRole({ slug: 'admin' }), ['editor', 'admin'])).toBe(true);
    expect(hasRole(makeRole({ slug: 'guest' }), ['editor', 'admin'])).toBe(false);
  });

  it('is false for a null role', () => {
    expect(hasRole(null, 'editor')).toBe(false);
    expect(hasRole(null, [])).toBe(false);
  });
});

describe('hasMinLevel', () => {
  it('compares the role level against the floor, inclusive', () => {
    expect(hasMinLevel(makeRole({ level: 50 }), ROLE_LEVEL.ADMIN)).toBe(true);
    expect(hasMinLevel(makeRole({ level: 49 }), ROLE_LEVEL.ADMIN)).toBe(false);
    expect(hasMinLevel(makeRole({ level: 100 }), ROLE_LEVEL.SUPER_ADMIN)).toBe(true);
  });

  it('treats a null role as level 0', () => {
    expect(hasMinLevel(null, 0)).toBe(true);
    expect(hasMinLevel(null, 1)).toBe(false);
  });
});

import { PermissionAction } from '../../../generated/prisma/client';
import {
  CUSTOM_ROLE_RANK,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_SLUG_PATTERN,
  SYSTEM_ROLES,
  UNASSIGNABLE_ROLE_SLUGS,
} from './SystemRoles.entity';

describe('system roles table (SPEC §6)', () => {
  it('keeps the slug and rank pairs the migration pins', () => {
    expect(SYSTEM_ROLES.map(({ slug, rank }) => [slug, rank])).toEqual([
      ['public', 0],
      ['guest', 10],
      ['reviewer', 20],
      ['editor', 30],
      ['admin', 40],
      ['owner', 100],
    ]);
  });

  it('derives the unassignable roles from the assignable flag: exactly public and reviewer', () => {
    expect([...UNASSIGNABLE_ROLE_SLUGS].sort()).toEqual(['public', 'reviewer']);
  });

  it('gives every system role an entry in the default permissions', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(
      SYSTEM_ROLES.map((role) => role.slug).sort(),
    );
  });

  it('keeps public and reviewer read-only by default', () => {
    for (const slug of ['public', 'reviewer'] as const) {
      const actions = DEFAULT_ROLE_PERMISSIONS[slug].flatMap(
        (row) => row.actions,
      );
      expect(new Set(actions)).toEqual(new Set([PermissionAction.read]));
    }
  });

  it('keeps custom ranks strictly between guest and editor', () => {
    expect(CUSTOM_ROLE_RANK).toEqual({ min: 11, max: 39 });
  });
});

describe('ROLE_SLUG_PATTERN', () => {
  it('is the kebab-case pattern createRoleSchema has always used', () => {
    expect(ROLE_SLUG_PATTERN.source).toBe('^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$');
    expect(ROLE_SLUG_PATTERN.flags).toBe('');
  });

  it.each(['writer', 'content-lead', 'a1-b2'])('accepts %s', (slug) => {
    expect(ROLE_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['', '1abc', 'Admin', 'a--b', '-a', 'a-', 'a_b'])(
    'rejects %j',
    (slug) => {
      expect(ROLE_SLUG_PATTERN.test(slug)).toBe(false);
    },
  );
});

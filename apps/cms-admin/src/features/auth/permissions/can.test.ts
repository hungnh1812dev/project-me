import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';

import { can, checkPermissions, scopeToContentType, toActor } from './can';
import { policies, type Actor } from './policies';

function actor(permissions: string[], level = 50, userId = 'me'): Actor {
  return { userId, level, permissions };
}

const ALLOW = { allowed: true, reason: null };
const requires = (slug: string) => ({
  allowed: false,
  reason: `Requires the "${slug}" permission.`,
});

describe('toActor', () => {
  it('reads the id, level and permissions of the user', () => {
    const user = makeMeUser({
      documentId: 'u-9',
      role: makeRole({ level: 20, permissions: ['media:read'] }),
    });

    expect(toActor(user)).toEqual({ userId: 'u-9', level: 20, permissions: ['media:read'] });
  });

  it('treats a user without a role as level 0 with no permissions', () => {
    expect(toActor(makeMeUser({ documentId: 'u-1', role: null }))).toEqual({
      userId: 'u-1',
      level: 0,
      permissions: [],
    });
  });

  it('treats no user as an anonymous actor', () => {
    expect(toActor(null)).toEqual({ userId: null, level: 0, permissions: [] });
  });
});

describe('can: deny by default', () => {
  it('denies an unknown subject', () => {
    expect(can(actor(['media:manager']), 'read', 'widget')).toEqual({
      allowed: false,
      reason: 'Unknown subject "widget".',
    });
  });

  it('denies an unknown action on a known subject', () => {
    expect(can(actor(['media:manager']), 'publish', 'media')).toEqual({
      allowed: false,
      reason: 'Unknown action "publish" on "media".',
    });
  });

  it.each([
    ['toString', 'media'],
    ['read', 'constructor'],
    ['hasOwnProperty', 'document'],
  ])('does not resolve inherited object keys (%s on %s)', (action, subject) => {
    expect(can(actor(['media:manager']), action, subject).allowed).toBe(false);
  });

  it('keeps the policy table a plain object keyed by subject', () => {
    expect(Object.keys(policies).sort()).toEqual([
      'api_token',
      'content_type',
      'document',
      'media',
      'permission',
      'role',
      'user',
    ]);
  });
});

describe('can: document', () => {
  it.each(['read', 'create', 'update', 'delete', 'publish', 'unpublish'])(
    'checks the global document:%s slug without a content type',
    (action) => {
      expect(can(actor([`document:${action}`]), action, 'document')).toEqual(ALLOW);
      expect(can(actor([]), action, 'document')).toEqual(requires(`document:${action}`));
    },
  );

  it('checks the scoped slug when a content type is given', () => {
    const scoped = actor(['document:update:blog']);

    expect(can(scoped, 'update', 'document', { contentTypeSlug: 'blog' })).toEqual(ALLOW);
    expect(can(scoped, 'update', 'document', { contentTypeSlug: 'news' })).toEqual(
      requires('document:update:news'),
    );
    expect(can(scoped, 'update', 'document')).toEqual(requires('document:update'));
  });

  it('lets a global grant cover every content type', () => {
    expect(
      can(actor(['document:delete']), 'delete', 'document', { contentTypeSlug: 'news' }),
    ).toEqual(ALLOW);
  });

  it.each(['publish', 'unpublish'])(
    'denies %s when the content type has no draft and publish workflow',
    (action) => {
      expect(
        can(actor([`document:${action}`]), action, 'document', {
          contentTypeSlug: 'blog',
          draftToPublish: false,
        }),
      ).toEqual({
        allowed: false,
        reason: 'This content type does not use draft and publish.',
      });
    },
  );

  it('still checks the permission first for publish', () => {
    expect(can(actor([]), 'publish', 'document', { draftToPublish: false })).toEqual(
      requires('document:publish'),
    );
  });

  it('allows publish when draftToPublish is true or unknown', () => {
    const publisher = actor(['document:publish']);

    expect(can(publisher, 'publish', 'document', { draftToPublish: true })).toEqual(ALLOW);
    expect(can(publisher, 'publish', 'document')).toEqual(ALLOW);
  });

  it('ignores draftToPublish for other actions', () => {
    expect(
      can(actor(['document:update']), 'update', 'document', { draftToPublish: false }),
    ).toEqual(ALLOW);
  });
});

describe('can: content_type', () => {
  it('maps read to content_type:read (manager also satisfies it)', () => {
    expect(can(actor(['content_type:read']), 'read', 'content_type')).toEqual(ALLOW);
    expect(can(actor(['content_type:manager']), 'read', 'content_type')).toEqual(ALLOW);
    expect(can(actor([]), 'read', 'content_type')).toEqual(requires('content_type:read'));
  });

  it('maps configure to content_type:manager', () => {
    expect(can(actor(['content_type:manager']), 'configure', 'content_type')).toEqual(ALLOW);
    expect(can(actor(['content_type:read']), 'configure', 'content_type')).toEqual(
      requires('content_type:manager'),
    );
  });
});

describe('can: user', () => {
  const manager = actor(['user:manager', 'user:role_manager'], 50, 'me');
  const higherTarget = {
    allowed: false,
    reason: 'Requires a higher role level than the target user.',
  };

  it('read requires user:read', () => {
    expect(can(actor(['user:read']), 'read', 'user')).toEqual(ALLOW);
    expect(can(actor(['user:manager']), 'read', 'user')).toEqual(ALLOW);
    expect(can(actor([]), 'read', 'user')).toEqual(requires('user:read'));
  });

  describe('update', () => {
    it('allows the own record without any permission', () => {
      expect(can(actor([], 0, 'me'), 'update', 'user', { targetUserId: 'me' })).toEqual(ALLOW);
    });

    it('requires user:manager for another user', () => {
      expect(
        can(actor([], 100), 'update', 'user', { targetUserId: 'other', targetLevel: 0 }),
      ).toEqual(requires('user:manager'));
    });

    it('requires a strictly higher level than the target', () => {
      expect(can(manager, 'update', 'user', { targetUserId: 'other', targetLevel: 20 })).toEqual(
        ALLOW,
      );
      expect(can(manager, 'update', 'user', { targetUserId: 'other', targetLevel: 50 })).toEqual(
        higherTarget,
      );
    });

    it('denies another user when the target level is unknown', () => {
      expect(can(manager, 'update', 'user', { targetUserId: 'other' })).toEqual(higherTarget);
    });

    it('does not treat an anonymous actor as the owner of a record without id', () => {
      expect(can(actor([], 0, ''), 'update', 'user', {})).toEqual(requires('user:manager'));
      expect(can({ userId: null, level: 0, permissions: [] }, 'update', 'user')).toEqual(
        requires('user:manager'),
      );
    });
  });

  describe('delete', () => {
    it('requires user:manager', () => {
      expect(
        can(actor([], 100), 'delete', 'user', { targetUserId: 'other', targetLevel: 0 }),
      ).toEqual(requires('user:manager'));
    });

    it('denies deleting yourself', () => {
      expect(can(manager, 'delete', 'user', { targetUserId: 'me', targetLevel: 0 })).toEqual({
        allowed: false,
        reason: 'You cannot delete your own account.',
      });
    });

    it('requires a strictly higher level than the target', () => {
      expect(can(manager, 'delete', 'user', { targetUserId: 'other', targetLevel: 20 })).toEqual(
        ALLOW,
      );
      expect(can(manager, 'delete', 'user', { targetUserId: 'other', targetLevel: 60 })).toEqual(
        higherTarget,
      );
    });
  });

  describe('assign_role', () => {
    const valid = { targetUserId: 'other', targetLevel: 20, newRoleLevel: 40 };

    it('allows a valid assignment', () => {
      expect(can(manager, 'assign_role', 'user', valid)).toEqual(ALLOW);
    });

    it('requires user:role_manager (user:manager is not enough)', () => {
      expect(can(actor(['user:manager'], 100), 'assign_role', 'user', valid)).toEqual(
        requires('user:role_manager'),
      );
    });

    it('denies changing your own role', () => {
      expect(can(manager, 'assign_role', 'user', { ...valid, targetUserId: 'me' })).toEqual({
        allowed: false,
        reason: 'You cannot change your own role.',
      });
    });

    it('requires a strictly higher level than the target', () => {
      expect(can(manager, 'assign_role', 'user', { ...valid, targetLevel: 50 })).toEqual(
        higherTarget,
      );
    });

    it('requires the new role level to be lower than your own', () => {
      const tooHigh = {
        allowed: false,
        reason: 'The new role level must be lower than your own.',
      };

      expect(can(manager, 'assign_role', 'user', { ...valid, newRoleLevel: 50 })).toEqual(tooHigh);
      expect(
        can(manager, 'assign_role', 'user', { targetUserId: 'other', targetLevel: 20 }),
      ).toEqual(tooHigh);
    });
  });
});

describe('can: role', () => {
  it('read requires role:read', () => {
    expect(can(actor(['role:read']), 'read', 'role')).toEqual(ALLOW);
    expect(can(actor([]), 'read', 'role')).toEqual(requires('role:read'));
  });

  it.each(['create', 'update', 'delete'])('%s requires role:manager', (action) => {
    expect(can(actor(['role:manager']), action, 'role')).toEqual(ALLOW);
    expect(can(actor(['role:read']), action, 'role')).toEqual(requires('role:manager'));
  });

  it('denies deleting a default role', () => {
    expect(can(actor(['role:manager']), 'delete', 'role', { isDefault: true })).toEqual({
      allowed: false,
      reason: 'A default role cannot be deleted.',
    });
    expect(can(actor(['role:manager']), 'delete', 'role', { isDefault: false })).toEqual(ALLOW);
  });

  it.each([['name'], ['level'], ['name', 'permissions']])(
    'denies updating %s of a default role',
    (...fields) => {
      expect(can(actor(['role:manager']), 'update', 'role', { isDefault: true, fields })).toEqual({
        allowed: false,
        reason: 'The name and level of a default role cannot be changed.',
      });
    },
  );

  it('allows updating other fields of a default role', () => {
    expect(
      can(actor(['role:manager']), 'update', 'role', {
        isDefault: true,
        fields: ['permissions'],
      }),
    ).toEqual(ALLOW);
    expect(can(actor(['role:manager']), 'update', 'role', { isDefault: true })).toEqual(ALLOW);
  });

  it('allows renaming a custom role', () => {
    expect(
      can(actor(['role:manager']), 'update', 'role', { isDefault: false, fields: ['name'] }),
    ).toEqual(ALLOW);
  });

  it('checks the permission before the default-role rule', () => {
    expect(can(actor([]), 'delete', 'role', { isDefault: true })).toEqual(requires('role:manager'));
  });
});

describe.each(['permission', 'api_token', 'media'])('can: %s', (subject) => {
  it('read requires the read slug (manager also satisfies it)', () => {
    expect(can(actor([`${subject}:read`]), 'read', subject)).toEqual(ALLOW);
    expect(can(actor([`${subject}:manager`]), 'read', subject)).toEqual(ALLOW);
    expect(can(actor([]), 'read', subject)).toEqual(requires(`${subject}:read`));
  });

  it.each(['create', 'update', 'delete', 'revoke', 'upload'])(
    '%s requires the manager slug',
    (action) => {
      expect(can(actor([`${subject}:manager`]), action, subject)).toEqual(ALLOW);
      expect(can(actor([`${subject}:read`]), action, subject)).toEqual(
        requires(`${subject}:manager`),
      );
    },
  );
});

describe('scopeToContentType', () => {
  it('scopes global document slugs only', () => {
    expect(scopeToContentType('document:update', 'blog')).toBe('document:update:blog');
    expect(scopeToContentType('document:update:news', 'blog')).toBe('document:update:news');
    expect(scopeToContentType('media:read', 'blog')).toBe('media:read');
  });

  it('leaves the slug alone without a content type', () => {
    expect(scopeToContentType('document:update', undefined)).toBe('document:update');
  });
});

describe('checkPermissions', () => {
  it('requires every slug by default and names the first missing one', () => {
    expect(checkPermissions(['media:read'], ['media:read', 'role:read', 'user:read'])).toEqual(
      requires('role:read'),
    );
    expect(checkPermissions(['media:read', 'role:read'], ['media:read', 'role:read'])).toEqual(
      ALLOW,
    );
  });

  it('accepts a single slug', () => {
    expect(checkPermissions(['media:manager'], 'media:read')).toEqual(ALLOW);
    expect(checkPermissions([], 'media:read')).toEqual(requires('media:read'));
  });

  it('passes an empty requirement in all mode and fails it in any mode', () => {
    expect(checkPermissions([], [])).toEqual(ALLOW);
    expect(checkPermissions(['media:read'], [], { mode: 'any' })).toEqual({
      allowed: false,
      reason: 'No permission was required.',
    });
  });

  it('needs one slug in any mode and names all of them when none is granted', () => {
    expect(checkPermissions(['role:read'], ['media:read', 'role:read'], { mode: 'any' })).toEqual(
      ALLOW,
    );
    expect(checkPermissions([], ['media:read', 'role:read'], { mode: 'any' })).toEqual({
      allowed: false,
      reason: 'Requires one of the "media:read", "role:read" permissions.',
    });
  });

  it('scopes document slugs to the content type', () => {
    const granted = ['document:update:blog'];

    expect(checkPermissions(granted, 'document:update', { contentTypeSlug: 'blog' })).toEqual(
      ALLOW,
    );
    expect(checkPermissions(granted, 'document:update', { contentTypeSlug: 'news' })).toEqual(
      requires('document:update:news'),
    );
  });
});

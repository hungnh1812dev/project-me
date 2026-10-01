import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import type { Actor, Decision } from '@/features/auth/permissions/policies';
import { makeContentTypeSummary } from '@/test/contentFixtures';

import {
  CONTENT_TYPE_ACTIONS,
  contentTypeAccess,
  filterReadableContentTypes,
  guard,
  type ContentTypeAction,
} from './access';
import type { ContentTypeRef } from './types';

function actor(permissions: string[]): Actor {
  return { userId: 'me', level: 10, permissions };
}

const ALLOW: Decision = { allowed: true, reason: null };
const requires = (slug: string): Decision => ({
  allowed: false,
  reason: `Requires the "${slug}" permission.`,
});
const NO_DRAFT: Decision = {
  allowed: false,
  reason: 'This content type does not use draft and publish.',
};

const BLOG: ContentTypeRef = { slug: 'blog', draftToPublish: true };
const NEWS: ContentTypeRef = { slug: 'news', draftToPublish: true };
const BLOG_MODE_B: ContentTypeRef = { slug: 'blog', draftToPublish: false };

const ALL_DOCUMENT = ['read', 'create', 'update', 'delete', 'publish', 'unpublish'].map(
  (action) => `document:${action}`,
);
// Seeded super_admin: every permission (no role name is special-cased in logic).
const SUPER_ADMIN = actor([...ALL_DOCUMENT, 'content_type:manager', 'content_type:read']);

describe('contentTypeAccess', () => {
  it('returns a Decision for every action', () => {
    const access = contentTypeAccess(actor([]), BLOG);

    expect(Object.keys(access).sort()).toEqual([...CONTENT_TYPE_ACTIONS].sort());
    expect(CONTENT_TYPE_ACTIONS).toEqual([
      'read',
      'create',
      'update',
      'delete',
      'publish',
      'unpublish',
      'bulkCreate',
      'bulkDelete',
      'configureColumns',
    ]);
  });

  const cases: {
    name: string;
    who: Actor;
    ref: ContentTypeRef;
    action: ContentTypeAction;
    expected: Decision;
  }[] = [
    // Global grants cover every content type.
    {
      name: 'global read',
      who: actor(['document:read']),
      ref: NEWS,
      action: 'read',
      expected: ALLOW,
    },
    {
      name: 'global create',
      who: actor(['document:create']),
      ref: BLOG,
      action: 'create',
      expected: ALLOW,
    },
    {
      name: 'global update',
      who: actor(['document:update']),
      ref: NEWS,
      action: 'update',
      expected: ALLOW,
    },
    {
      name: 'global delete',
      who: actor(['document:delete']),
      ref: BLOG,
      action: 'delete',
      expected: ALLOW,
    },
    {
      name: 'global publish',
      who: actor(['document:publish']),
      ref: BLOG,
      action: 'publish',
      expected: ALLOW,
    },
    {
      name: 'global unpublish',
      who: actor(['document:unpublish']),
      ref: BLOG,
      action: 'unpublish',
      expected: ALLOW,
    },
    {
      name: 'bulkDelete follows delete',
      who: actor(['document:delete']),
      ref: NEWS,
      action: 'bulkDelete',
      expected: ALLOW,
    },

    // Scoped grants cover only their own slug.
    {
      name: 'scoped update on its slug',
      who: actor(['document:update:blog']),
      ref: BLOG,
      action: 'update',
      expected: ALLOW,
    },
    {
      name: 'scoped update on another slug',
      who: actor(['document:update:blog']),
      ref: NEWS,
      action: 'update',
      expected: requires('document:update:news'),
    },
    {
      name: 'scoped read on its slug',
      who: actor(['document:read:blog']),
      ref: BLOG,
      action: 'read',
      expected: ALLOW,
    },
    {
      name: 'scoped read on another slug',
      who: actor(['document:read:blog']),
      ref: NEWS,
      action: 'read',
      expected: requires('document:read:news'),
    },
    {
      name: 'scoped delete gives bulkDelete',
      who: actor(['document:delete:blog']),
      ref: BLOG,
      action: 'bulkDelete',
      expected: ALLOW,
    },
    {
      name: 'scoped delete elsewhere denies bulkDelete',
      who: actor(['document:delete:blog']),
      ref: NEWS,
      action: 'bulkDelete',
      expected: requires('document:delete:news'),
    },

    // Missing permissions.
    {
      name: 'no read',
      who: actor([]),
      ref: BLOG,
      action: 'read',
      expected: requires('document:read:blog'),
    },
    {
      name: 'no create',
      who: actor(['document:read']),
      ref: BLOG,
      action: 'create',
      expected: requires('document:create:blog'),
    },
    {
      name: 'no delete',
      who: actor([]),
      ref: BLOG,
      action: 'delete',
      expected: requires('document:delete:blog'),
    },
    {
      name: 'no bulkDelete',
      who: actor([]),
      ref: BLOG,
      action: 'bulkDelete',
      expected: requires('document:delete:blog'),
    },

    // Mode B (draftToPublish: false).
    {
      name: 'Mode B denies publish',
      who: actor(['document:publish']),
      ref: BLOG_MODE_B,
      action: 'publish',
      expected: NO_DRAFT,
    },
    {
      name: 'Mode B denies unpublish',
      who: actor(['document:unpublish:blog']),
      ref: BLOG_MODE_B,
      action: 'unpublish',
      expected: NO_DRAFT,
    },
    {
      name: 'Mode B still allows update',
      who: actor(['document:update']),
      ref: BLOG_MODE_B,
      action: 'update',
      expected: ALLOW,
    },
    {
      name: 'Mode B without publish names the slug first',
      who: actor([]),
      ref: BLOG_MODE_B,
      action: 'publish',
      expected: requires('document:publish:blog'),
    },

    // bulkCreate needs create and then publish.
    {
      name: 'bulkCreate with both',
      who: actor(['document:create', 'document:publish:blog']),
      ref: BLOG,
      action: 'bulkCreate',
      expected: ALLOW,
    },
    {
      name: 'bulkCreate without either names create',
      who: actor([]),
      ref: BLOG,
      action: 'bulkCreate',
      expected: requires('document:create:blog'),
    },
    {
      name: 'bulkCreate without create names create',
      who: actor(['document:publish']),
      ref: BLOG,
      action: 'bulkCreate',
      expected: requires('document:create:blog'),
    },
    {
      name: 'bulkCreate without publish names publish',
      who: actor(['document:create']),
      ref: BLOG,
      action: 'bulkCreate',
      expected: requires('document:publish:blog'),
    },
    {
      name: 'bulkCreate with scope for another slug',
      who: actor(['document:create:blog', 'document:publish:blog']),
      ref: NEWS,
      action: 'bulkCreate',
      expected: requires('document:create:news'),
    },
    {
      name: 'bulkCreate in Mode B',
      who: actor(['document:create', 'document:publish']),
      ref: BLOG_MODE_B,
      action: 'bulkCreate',
      expected: NO_DRAFT,
    },

    // configureColumns is content_type:manager, regardless of the slug.
    {
      name: 'configureColumns with manager',
      who: actor(['content_type:manager']),
      ref: BLOG,
      action: 'configureColumns',
      expected: ALLOW,
    },
    {
      name: 'configureColumns with read only',
      who: actor(['content_type:read', ...ALL_DOCUMENT]),
      ref: BLOG,
      action: 'configureColumns',
      expected: requires('content_type:manager'),
    },
  ];

  it.each(cases)('$name: $action on $ref.slug', ({ who, ref, action, expected }) => {
    expect(contentTypeAccess(who, ref)[action]).toEqual(expected);
  });

  it.each(CONTENT_TYPE_ACTIONS)('super_admin is allowed %s', (action) => {
    expect(contentTypeAccess(SUPER_ADMIN, BLOG)[action]).toEqual(ALLOW);
  });

  it.each(['publish', 'unpublish', 'bulkCreate'] as const)(
    'super_admin is still denied %s in Mode B',
    (action) => {
      expect(contentTypeAccess(SUPER_ADMIN, BLOG_MODE_B)[action]).toEqual(NO_DRAFT);
    },
  );

  it('is pure: the same input gives equal decisions', () => {
    const who = actor(['document:read:blog']);

    expect(contentTypeAccess(who, BLOG)).toEqual(contentTypeAccess(who, BLOG));
  });
});

describe('filterReadableContentTypes', () => {
  const blog = makeContentTypeSummary({ slug: 'blog', name: 'Blog' });
  const news = makeContentTypeSummary({ slug: 'news', name: 'News' });
  const home = makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' });
  const types = [blog, news, home];

  it('keeps every type for a global read grant', () => {
    expect(filterReadableContentTypes(actor(['document:read']), types)).toEqual(types);
  });

  it('keeps only the scoped types', () => {
    const who = actor(['document:read:blog', 'document:read:home']);

    expect(filterReadableContentTypes(who, types)).toEqual([blog, home]);
  });

  it('keeps nothing without a read grant', () => {
    expect(filterReadableContentTypes(actor(['document:update']), types)).toEqual([]);
  });

  it('does not mutate the input', () => {
    filterReadableContentTypes(actor([]), types);

    expect(types).toEqual([blog, news, home]);
  });
});

describe('guard', () => {
  it('returns when the decision is allowed', () => {
    expect(() => guard(ALLOW)).not.toThrow();
  });

  it('throws ApiError 403 ERR_CLIENT_FORBIDDEN with the reason when denied', () => {
    let thrown: unknown;
    try {
      guard(requires('document:update:blog'));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'Requires the "document:update:blog" permission.',
      messages: ['Requires the "document:update:blog" permission.'],
    });
  });

  it('falls back to a generic message when a denial has no reason', () => {
    expect(() => guard({ allowed: false, reason: null })).toThrow(
      expect.objectContaining({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: 'Forbidden.' }),
    );
  });
});

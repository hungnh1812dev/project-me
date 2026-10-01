import { describe, expect, it } from 'vitest';

import type { Actor } from '@/features/auth/permissions/policies';
import type { ContentTypeSummary } from '@/features/content/types';
import { makeContentTypeSummary } from '@/test/contentFixtures';

import { buildNavModel } from './navigation';
import { SETTINGS_LINKS } from './settingsLinks';

const actor = (permissions: string[]): Actor => ({ userId: 'user-1', level: 10, permissions });

const types: ContentTypeSummary[] = [
  makeContentTypeSummary({ slug: 'post', name: 'Post', kind: 'collection' }),
  makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' }),
  makeContentTypeSummary({ slug: 'article', name: 'Article', kind: 'collection' }),
  makeContentTypeSummary({ slug: 'about', name: 'About us', kind: 'single' }),
];

const keys = (links: readonly { key: string }[]) => links.map((link) => link.key);

describe('SETTINGS_LINKS', () => {
  it('lists the five settings links with their routes and read permissions (AC-25)', () => {
    expect(SETTINGS_LINKS.map(({ label, to, permission }) => ({ label, to, permission }))).toEqual([
      { label: 'Users', to: '/admin/settings/users', permission: 'user:read' },
      { label: 'Roles', to: '/admin/settings/roles', permission: 'role:read' },
      { label: 'Permissions', to: '/admin/settings/permissions', permission: 'permission:read' },
      { label: 'Access tokens', to: '/admin/settings/access-tokens', permission: 'api_token:read' },
      { label: 'Media library', to: '/admin/settings/media', permission: 'media:read' },
    ]);
    for (const link of SETTINGS_LINKS) expect(link.icon).toBeDefined();
  });
});

describe('buildNavModel: content', () => {
  it('has no content section while the types are unknown (no access, loading or failed)', () => {
    expect(buildNavModel(actor(['document:read']), null).content).toBeNull();
  });

  it('groups readable types into single and collection, sorted by name (AC-22)', () => {
    const { content } = buildNavModel(actor(['document:read']), types);

    expect(content?.single.map((l) => l.label)).toEqual(['About us', 'Home']);
    expect(content?.collection.map((l) => l.label)).toEqual(['Article', 'Post']);
  });

  it('links each type to its content-type page, encoding the slug', () => {
    const { content } = buildNavModel(actor(['document:read']), [
      makeContentTypeSummary({ slug: 'blog post', name: 'Blog', kind: 'collection' }),
    ]);

    expect(content?.collection).toEqual([
      { key: 'blog post', label: 'Blog', to: '/admin/content-types/blog%20post' },
    ]);
  });

  it('keeps only the types a scoped document:read:<slug> grant allows', () => {
    const { content } = buildNavModel(actor(['document:read:home', 'document:read:post']), types);

    expect(keys(content?.single ?? [])).toEqual(['home']);
    expect(keys(content?.collection ?? [])).toEqual(['post']);
  });

  it('gives empty groups when no type is readable', () => {
    expect(buildNavModel(actor([]), types).content).toEqual({ single: [], collection: [] });
  });

  it('gives empty groups for an empty list', () => {
    expect(buildNavModel(actor(['document:read']), []).content).toEqual({
      single: [],
      collection: [],
    });
  });

  it('does not reorder the input list', () => {
    const input = [...types];
    buildNavModel(actor(['document:read']), input);

    expect(input).toEqual(types);
  });
});

describe('buildNavModel: settings', () => {
  it.each([
    [[], []],
    [['user:read'], ['users']],
    [['user:manager'], ['users']],
    [['media:manager'], ['media']],
    [
      ['role:read', 'permission:read'],
      ['roles', 'permissions'],
    ],
    [['api_token:manager', 'user:create'], ['access-tokens']],
    [
      ['user:read', 'role:read', 'permission:read', 'api_token:read', 'media:read'],
      ['users', 'roles', 'permissions', 'access-tokens', 'media'],
    ],
  ])('with %j shows %j (AC-25)', (permissions, expected) => {
    expect(keys(buildNavModel(actor(permissions), null).settings)).toEqual(expected);
  });
});

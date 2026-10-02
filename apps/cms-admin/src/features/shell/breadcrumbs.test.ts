import { describe, expect, it } from 'vitest';

import { buildBreadcrumbs, contentTypeSlugOf, type Crumb } from './breadcrumbs';

const HOME: Crumb = { label: 'Home', to: '/admin' };
const CONTENT_TYPES: Crumb = { label: 'Content types', to: '/admin/content-types' };
const SETTINGS: Crumb = { label: 'Settings' };

describe('buildBreadcrumbs', () => {
  it.each<[string, Crumb[]]>([
    ['/admin', [{ label: 'Home' }]],
    ['/admin/', [{ label: 'Home' }]],
    ['/admin/profile', [HOME, { label: 'Profile' }]],
    ['/admin/content-types', [HOME, { label: 'Content types' }]],
    ['/admin/content-types/article', [HOME, CONTENT_TYPES, { label: 'article' }]],
    ['/admin/settings/users', [HOME, SETTINGS, { label: 'Users' }]],
    ['/admin/settings/roles', [HOME, SETTINGS, { label: 'Roles' }]],
    ['/admin/settings/permissions', [HOME, SETTINGS, { label: 'Permissions' }]],
    ['/admin/settings/access-tokens', [HOME, SETTINGS, { label: 'Access tokens' }]],
    ['/admin/settings/media', [HOME, SETTINGS, { label: 'Media library' }]],
    ['/admin/dev/ui-kit', [HOME, { label: 'UI kit' }]],
    ['/admin/reports', [HOME, { label: 'Reports' }]],
    ['/admin/audit-log', [HOME, { label: 'Audit Log' }]],
    ['/admin/settings/unknown_page', [HOME, { label: 'Unknown Page' }]],
    ['/admin/content-types/article/extra', [HOME, CONTENT_TYPES, { label: 'article' }]],
  ])('%s', (pathname, trail) => {
    expect(buildBreadcrumbs(pathname)).toEqual(trail);
  });

  it('shows the content-type name once it is known', () => {
    expect(
      buildBreadcrumbs('/admin/content-types/article', { contentTypeName: 'Article' }),
    ).toEqual([HOME, CONTENT_TYPES, { label: 'Article' }]);
  });

  it('decodes an encoded slug while the name is unknown', () => {
    expect(buildBreadcrumbs('/admin/content-types/caf%C3%A9').at(-1)).toEqual({ label: 'café' });
  });

  it('keeps a malformed escape as it is', () => {
    expect(buildBreadcrumbs('/admin/content-types/%E0%A4%A').at(-1)).toEqual({
      label: '%E0%A4%A',
    });
  });

  it('ignores the content-type name on other pages', () => {
    expect(buildBreadcrumbs('/admin/profile', { contentTypeName: 'Article' })).toEqual([
      HOME,
      { label: 'Profile' },
    ]);
  });

  it('treats a path outside /admin like an unknown page', () => {
    expect(buildBreadcrumbs('/login')).toEqual([HOME, { label: 'Login' }]);
  });
});

describe('contentTypeSlugOf', () => {
  it.each<[string, string | null]>([
    ['/admin/content-types/article', 'article'],
    ['/admin/content-types/caf%C3%A9', 'café'],
    ['/admin/content-types/article/', 'article'],
    ['/admin/content-types', null],
    ['/admin/profile', null],
    ['/admin', null],
  ])('%s -> %s', (pathname, slug) => {
    expect(contentTypeSlugOf(pathname)).toBe(slug);
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildBreadcrumbs,
  contentDocumentIdOf,
  contentTypeSlugOf,
  NEW_ENTRY,
  type Crumb,
} from './breadcrumbs';

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

describe('buildBreadcrumbs for entries (AC-39)', () => {
  const ARTICLE: Crumb = { label: 'article', to: '/admin/content-types/article' };

  it('adds "New entry" below the content type on /new', () => {
    expect(buildBreadcrumbs('/admin/content-types/article/new')).toEqual([
      HOME,
      CONTENT_TYPES,
      ARTICLE,
      { label: 'New entry' },
    ]);
    expect(NEW_ENTRY).toBe('New entry');
  });

  it('links the content type by name once it is known', () => {
    expect(
      buildBreadcrumbs('/admin/content-types/article/new', { contentTypeName: 'Article' }).at(2),
    ).toEqual({ label: 'Article', to: '/admin/content-types/article' });
  });

  it('shows the entry label on a detail page', () => {
    expect(
      buildBreadcrumbs('/admin/content-types/article/doc-1', {
        contentTypeName: 'Article',
        entryLabel: 'Hello world',
      }),
    ).toEqual([
      HOME,
      CONTENT_TYPES,
      { label: 'Article', to: '/admin/content-types/article' },
      { label: 'Hello world' },
    ]);
  });

  it('shows the decoded documentId until the entry label is known', () => {
    expect(buildBreadcrumbs('/admin/content-types/article/doc%201').at(-1)).toEqual({
      label: 'doc 1',
    });
  });

  it('encodes the slug in the content-type link', () => {
    expect(buildBreadcrumbs('/admin/content-types/caf%C3%A9/new').at(2)).toEqual({
      label: 'café',
      to: '/admin/content-types/caf%C3%A9',
    });
  });

  it('ignores the entry label on the content-type page itself', () => {
    expect(
      buildBreadcrumbs('/admin/content-types/article', { entryLabel: 'Hello' }).at(-1),
    ).toEqual({ label: 'article' });
  });

  it('ignores segments below the entry', () => {
    expect(buildBreadcrumbs('/admin/content-types/article/doc-1/extra')).toEqual([
      HOME,
      CONTENT_TYPES,
      ARTICLE,
      { label: 'doc-1' },
    ]);
  });
});

describe('contentDocumentIdOf', () => {
  it.each<[string, string | null]>([
    ['/admin/content-types/article/doc-1', 'doc-1'],
    ['/admin/content-types/article/doc%2F1', 'doc/1'],
    ['/admin/content-types/article/new', null],
    ['/admin/content-types/article', null],
    ['/admin/content-types', null],
    ['/admin/settings/users/x', null],
  ])('%s -> %s', (pathname, documentId) => {
    expect(contentDocumentIdOf(pathname)).toBe(documentId);
  });
});

describe('contentTypeSlugOf', () => {
  it.each<[string, string | null]>([
    ['/admin/content-types/article', 'article'],
    ['/admin/content-types/caf%C3%A9', 'café'],
    ['/admin/content-types/article/', 'article'],
    ['/admin/content-types/article/new', 'article'],
    ['/admin/content-types/article/doc-1', 'article'],
    ['/admin/content-types', null],
    ['/admin/profile', null],
    ['/admin', null],
  ])('%s -> %s', (pathname, slug) => {
    expect(contentTypeSlugOf(pathname)).toBe(slug);
  });
});

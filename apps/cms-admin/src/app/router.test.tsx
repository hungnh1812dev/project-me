import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { RouteObject } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeContentType } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  getContentTypeHandler,
  getContentTypesHandler,
  getDocumentHandler,
  getSingleTypeHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import {
  listAccessTokensHandler,
  listMediaHandler,
  listPermissionsHandler,
  listRolesHandler,
  listUsersHandler,
} from '@/test/msw/settingsHandlers';
import { renderRoutes } from '@/test/renderWithProviders';

import { routes } from './router';

const signedIn = (permissions: string[] = []) => ({
  status: 'authenticated' as const,
  user: makeMeUser({ name: 'Jane Doe', role: makeRole({ permissions }) }),
});

describe('route table', () => {
  // The Users, Roles, Permissions, Access tokens and Media pages load U1, R1, P1, T1 and M1 as
  // soon as they render (R1 only with `role:read`).
  beforeEach(() =>
    server.use(
      listAccessTokensHandler().handler,
      listMediaHandler().handler,
      listUsersHandler().handler,
      listRolesHandler().handler,
      listPermissionsHandler().handler,
    ),
  );

  it('serves the admin home at /admin', async () => {
    renderRoutes(routes, { route: '/admin', auth: signedIn() });

    expect(await screen.findByRole('heading', { name: 'Welcome, Jane Doe' })).toBeInTheDocument();
  });

  it('redirects unknown paths to /admin', async () => {
    const { router } = renderRoutes(routes, { route: '/nowhere', auth: signedIn() });

    expect(await screen.findByRole('heading', { name: 'Welcome, Jane Doe' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('protects /admin/profile behind login', async () => {
    const { router } = renderRoutes(routes, {
      route: '/admin/profile',
      auth: { status: 'unauthenticated' },
    });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ from: '/admin/profile' });
  });

  it('serves /403 without a session', async () => {
    renderRoutes(routes, { route: '/403', auth: { status: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('redirects /admin/users to /admin/settings/users (AC-26)', async () => {
    const { router } = renderRoutes(routes, {
      route: '/admin/users',
      auth: signedIn(['user:read']),
    });

    expect(await screen.findByRole('heading', { name: 'Users', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/settings/users');
  });

  it.each([
    ['users', 'Users', 'user:read'],
    ['roles', 'Roles', 'role:read'],
    ['permissions', 'Permissions', 'permission:read'],
    ['access-tokens', 'Access tokens', 'api_token:read'],
    ['media', 'Media library', 'media:read'],
  ])('gates /admin/settings/%s behind its read permission', async (path, label, permission) => {
    const denied = renderRoutes(routes, { route: `/admin/settings/${path}`, auth: signedIn([]) });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(denied.router.state.location.pathname).toBe('/403');
    expect(screen.getByText(`Requires the "${permission}" permission.`)).toBeInTheDocument();
    denied.unmount();

    renderRoutes(routes, { route: `/admin/settings/${path}`, auth: signedIn([permission]) });

    expect(await screen.findByRole('heading', { name: label, level: 1 })).toBeInTheDocument();
  });

  it('serves the real Users page from SETTINGS_PAGES (AC-1)', async () => {
    renderRoutes(routes, { route: '/admin/settings/users', auth: signedIn(['user:read']) });

    expect(await screen.findByRole('searchbox', { name: 'Search users' })).toBeInTheDocument();
    expect(screen.queryByText('Coming in Phase 4.')).not.toBeInTheDocument();
  });

  it('serves the real Permissions page from SETTINGS_PAGES (AC-1)', async () => {
    renderRoutes(routes, {
      route: '/admin/settings/permissions',
      auth: signedIn(['permission:read']),
    });

    expect(
      await screen.findByRole('searchbox', { name: 'Search permissions' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Coming in Phase 4.')).not.toBeInTheDocument();
  });

  it('serves the real Roles page from SETTINGS_PAGES (AC-1)', async () => {
    renderRoutes(routes, { route: '/admin/settings/roles', auth: signedIn(['role:read']) });

    expect(await screen.findByRole('searchbox', { name: 'Search roles' })).toBeInTheDocument();
    expect(screen.queryByText('Coming in Phase 4.')).not.toBeInTheDocument();
  });

  it('serves the real Access tokens page from SETTINGS_PAGES (AC-1)', async () => {
    renderRoutes(routes, {
      route: '/admin/settings/access-tokens',
      auth: signedIn(['api_token:read']),
    });

    expect(
      await screen.findByRole('searchbox', { name: 'Search access tokens' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Coming in Phase 4.')).not.toBeInTheDocument();
  });

  it('serves the real Media library page from SETTINGS_PAGES (AC-1)', async () => {
    renderRoutes(routes, { route: '/admin/settings/media', auth: signedIn(['media:read']) });

    expect(await screen.findByRole('searchbox', { name: 'Search files' })).toBeInTheDocument();
    expect(screen.queryByText('Coming in Phase 4.')).not.toBeInTheDocument();
  });

  it('opens a settings page with the matching manager permission', async () => {
    renderRoutes(routes, { route: '/admin/settings/media', auth: signedIn(['media:manager']) });

    expect(
      await screen.findByRole('heading', { name: 'Media library', level: 1 }),
    ).toBeInTheDocument();
  });

  it('gates /admin/content-types behind content_type:read', async () => {
    const c1 = getContentTypesHandler();
    server.use(c1.handler);
    const { router } = renderRoutes(routes, { route: '/admin/content-types', auth: signedIn([]) });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/403');
    expect(c1.requests).toHaveLength(0);
  });

  it('opens /admin/content-types with content_type:read', async () => {
    server.use(getContentTypesHandler().handler);
    renderRoutes(routes, { route: '/admin/content-types', auth: signedIn(['content_type:read']) });

    expect(await screen.findByRole('heading', { name: 'Content types' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('gates /admin/content-types/:slug behind content_type:read', async () => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);
    const { router } = renderRoutes(routes, {
      route: '/admin/content-types/article',
      auth: signedIn([]),
    });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/403');
    expect(c2.requests).toHaveLength(0);
  });

  it.each([
    ['/admin/content-types/article/new', 'New entry'],
    ['/admin/content-types/article/doc-1', 'doc-1'],
  ])('gates %s behind content_type:read (AC-39)', async (route) => {
    const c2 = getContentTypeHandler();
    server.use(c2.handler);
    const { router } = renderRoutes(routes, { route, auth: signedIn([]) });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/403');
    expect(c2.requests).toHaveLength(0);
  });

  it('serves the create page at /admin/content-types/:slug/new (AC-39)', async () => {
    server.use(getContentTypeHandler().handler);
    const { router } = renderRoutes(routes, {
      route: '/admin/content-types/article/new',
      auth: signedIn(['content_type:read', 'document:create']),
    });

    expect(await screen.findByRole('heading', { name: 'New entry', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/content-types/article/new');
  });

  it('serves the detail page at /admin/content-types/:slug/:documentId (AC-39)', async () => {
    const d3 = getDocumentHandler();
    server.use(getContentTypeHandler().handler, d3.handler);
    renderRoutes(routes, {
      route: '/admin/content-types/article/doc%201',
      auth: signedIn(['content_type:read', 'document:read']),
    });

    // The heading is the entry label (the fixture's title).
    expect(
      await screen.findByRole('heading', { name: 'Hello world', level: 1 }),
    ).toBeInTheDocument();
    expect(d3.requests[0]!.params.documentId).toBe('doc 1');
  });

  it('redirects /new on a single type to the single-type editor (AC-39)', async () => {
    server.use(
      getContentTypeHandler(({ params }) =>
        HttpResponse.json(makeContentType({ slug: params.slug, name: 'Home', kind: 'single' })),
      ).handler,
      getSingleTypeHandler().handler,
    );
    const { router } = renderRoutes(routes, {
      route: '/admin/content-types/home/new',
      auth: signedIn(['content_type:read', 'document:read']),
    });

    expect(await screen.findByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/content-types/home');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it.each([
    ['/register', 'Create account'],
    ['/verify-otp', 'Verify your email'],
    ['/forgot-password', 'Reset your password'],
    ['/reset-password', 'Link expired'],
    ['/reset-password?token=t', 'Choose a new password'],
  ])('serves the public page %s without a session', async (route, heading) => {
    renderRoutes(routes, { route, auth: { status: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each([
    ['/admin', 'Welcome, Jane Doe', ['user:read']],
    ['/admin/profile', 'Your profile', []],
    ['/admin/settings/users', 'Users', ['user:read']],
    ['/admin/content-types', 'Content types', ['content_type:read']],
    ['/admin/content-types/article', 'Article', ['content_type:read']],
    ['/admin/dev/ui-kit', 'UI kit', []],
  ])('renders %s inside the shell with exactly one main', async (route, heading, permissions) => {
    server.use(getContentTypesHandler().handler, getContentTypeHandler().handler);
    renderRoutes(routes, { route, auth: signedIn(permissions) });

    const h1 = await screen.findByRole('heading', { name: heading, level: 1 });
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(h1);
  });

  it.each([
    ['/login', 'Sign in'],
    ['/403', 'Access denied'],
  ])('renders %s without the shell', async (route, heading) => {
    renderRoutes(routes, { route, auth: { status: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Skip to content' })).not.toBeInTheDocument();
  });

  it('sends a first run from /login to the admin setup at /register', async () => {
    server.use(http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: false })));
    const { router } = renderRoutes(routes, {
      route: '/login',
      auth: { status: 'unauthenticated' },
    });

    expect(
      await screen.findByRole('heading', { name: 'Set up admin account' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/register');
  });
});

/** Every path in the table, joined with its parents (e.g. `/admin/dev/ui-kit`). */
function allPaths(table: RouteObject[], parent = ''): string[] {
  return table.flatMap((route) => {
    const path = route.path
      ? `${parent.replace(/\/$/, '')}/${route.path.replace(/^\//, '')}`
      : parent;
    return [path, ...allPaths(route.children ?? [], path)];
  });
}

describe('dev-only UI kit route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves /admin/dev/ui-kit behind login in development', async () => {
    renderRoutes(routes, { route: '/admin/dev/ui-kit', auth: signedIn() });

    expect(await screen.findByRole('heading', { name: 'UI kit', level: 1 })).toBeInTheDocument();
  });

  it('protects /admin/dev/ui-kit behind login', async () => {
    renderRoutes(routes, { route: '/admin/dev/ui-kit', auth: { status: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('is not registered when import.meta.env.DEV is false', async () => {
    expect(allPaths(routes)).toContain('/admin/dev/ui-kit');

    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { routes: productionRoutes } = await import('./router');

    expect(allPaths(productionRoutes)).not.toContain('/admin/dev/ui-kit');
  });
});

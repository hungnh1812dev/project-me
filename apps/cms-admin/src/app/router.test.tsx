import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { getContentTypeHandler, getContentTypesHandler } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import { routes } from './router';

const signedIn = (permissions: string[] = []) => ({
  status: 'authenticated' as const,
  user: makeMeUser({ name: 'Jane Doe', role: makeRole({ permissions }) }),
});

describe('route table', () => {
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

  it('gates /admin/users behind the user:read permission', async () => {
    const { router } = renderRoutes(routes, { route: '/admin/users', auth: signedIn([]) });

    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/403');
  });

  it('opens /admin/users with the user:read permission', async () => {
    renderRoutes(routes, { route: '/admin/users', auth: signedIn(['user:read']) });

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
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
    ['/admin/users', 'Users', ['user:read']],
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

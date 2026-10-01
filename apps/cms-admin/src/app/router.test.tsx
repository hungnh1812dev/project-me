import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
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

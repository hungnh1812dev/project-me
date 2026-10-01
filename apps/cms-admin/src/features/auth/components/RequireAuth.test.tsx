import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import { sessionExpired } from '../store/AuthSlice';
import { resetBootstrapLatch } from '../store/sessionThunks';
import RequireAuth from './RequireAuth';

const LoginProbe = () => {
  const state: unknown = useLocation().state;
  return <p>login page, from: {JSON.stringify(state)}</p>;
};

const routes = [
  { path: '/login', element: <LoginProbe /> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      { index: true, element: <p>Admin home</p> },
      { path: 'profile', element: <p>Profile</p> },
    ],
  },
];

beforeEach(() => {
  resetBootstrapLatch();
});

describe('<RequireAuth>', () => {
  it.each(['idle', 'loading'] as const)('shows the connecting view while %s', (status) => {
    renderRoutes(routes, { route: '/admin', auth: { status } });

    expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
    expect(screen.queryByText('Admin home')).not.toBeInTheDocument();
  });

  it('renders the protected route when authenticated', () => {
    renderRoutes(routes, {
      route: '/admin/profile',
      auth: { status: 'authenticated', user: makeMeUser() },
    });

    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('redirects to /login with the page to return to', () => {
    const { router } = renderRoutes(routes, {
      route: '/admin/profile?tab=perms',
      auth: { status: 'unauthenticated' },
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(
      screen.getByText('login page, from: {"from":"/admin/profile?tab=perms"}'),
    ).toBeInTheDocument();
  });

  it('sends the user to /login when the session expires on a protected page', () => {
    const { store, router } = renderRoutes(routes, {
      route: '/admin/profile',
      auth: { status: 'authenticated', user: makeMeUser(), accessToken: 'tok' },
    });

    act(() => {
      store.dispatch(sessionExpired());
    });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/admin/profile' });
  });

  it('shows the error view, and Retry runs the bootstrap again', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'tok' }),
      ),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(makeMeUser())),
    );
    const { user } = renderRoutes(routes, {
      route: '/admin',
      auth: { status: 'error', error: 'Network Error' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server.");
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Admin home')).toBeInTheDocument();
  });
});

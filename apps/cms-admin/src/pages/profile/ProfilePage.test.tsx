import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/features/auth/components/RequireAuth';
import type { MeUser } from '@/features/auth/types';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import ProfilePage from './ProfilePage';

const routes = [
  { path: '/login', element: <h1>Sign in</h1> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [{ path: 'profile', element: <ProfilePage /> }],
  },
];

function renderProfile(storeUser: MeUser, serverUser: MeUser | null = storeUser) {
  server.use(
    http.get('*/api/v1/auth/me', () =>
      serverUser
        ? HttpResponse.json(serverUser)
        : HttpResponse.json({ statusCode: 404, message: 'Role not found' }, { status: 404 }),
    ),
  );
  return renderRoutes(routes, {
    route: '/admin/profile',
    auth: { status: 'authenticated', accessToken: 'tok', user: storeUser },
  });
}

describe('ProfilePage', () => {
  it('shows the identity and verified state', async () => {
    renderProfile(makeMeUser({ name: 'Jane Doe', username: 'janedoe', verified: true }));

    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('janedoe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows an unverified account', () => {
    renderProfile(makeMeUser({ verified: false }));

    expect(screen.getByText('Not verified')).toBeInTheDocument();
  });

  it('shows the role and its permissions', () => {
    renderProfile(
      makeMeUser({
        role: makeRole({
          name: 'Editor',
          slug: 'editor',
          level: 20,
          permissions: ['a:read', 'b:read'],
        }),
      }),
    );

    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Permissions' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['a:read', 'b:read']);
  });

  it('says when no role is assigned', () => {
    renderProfile(makeMeUser({ roleId: null, role: null }));

    expect(screen.getByText('No role assigned')).toBeInTheDocument();
    expect(screen.getByText('No permissions')).toBeInTheDocument();
  });

  it('says when the role has no permissions', () => {
    renderProfile(makeMeUser({ role: makeRole({ permissions: [] }) }));

    expect(screen.getByText('No permissions')).toBeInTheDocument();
  });

  it('shows the latest data from the server', async () => {
    renderProfile(makeMeUser({ name: 'Old Name' }), makeMeUser({ name: 'New Name' }));

    expect(await screen.findByText('New Name')).toBeInTheDocument();
  });

  it('keeps showing the signed-in user when the refetch fails', async () => {
    renderProfile(makeMeUser({ name: 'Jane Doe' }), null);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't refresh your profile.");
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('logs out and lands on /login', async () => {
    let loggedOut = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        loggedOut = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user, store, router } = renderProfile(makeMeUser());

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', accessToken: null });
    await vi.waitFor(() => expect(loggedOut).toBe(true));
  });
});

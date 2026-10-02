import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/features/auth/components/RequireAuth';
import type { MeUser } from '@/features/auth/types';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { settingsErrorReply, updateUserHandler } from '@/test/msw/settingsHandlers';
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

  it('is a card with the slug and permissions in mono font and a Log out button (AC-4, AC-38)', () => {
    renderProfile(
      makeMeUser({
        role: makeRole({ name: 'Editor', slug: 'editor', permissions: ['a:read'] }),
      }),
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Your profile' });
    expect(heading.closest('[data-slot="card"]')).not.toBeNull();
    expect(screen.getByText('editor')).toHaveClass('font-mono');
    expect(screen.getByRole('list', { name: 'Permissions' })).toHaveClass('font-mono');
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveAttribute('data-slot', 'button');
  });

  describe('name editing (AC-39 to AC-41)', () => {
    const ME = makeMeUser({ documentId: 'me-1', name: 'Jane Doe' });

    it('opens an inline, prefilled, required Name field with Save and Cancel', async () => {
      const { user } = renderProfile(ME);

      await user.click(await screen.findByRole('button', { name: 'Edit name' }));

      const input = screen.getByRole('textbox', { name: 'Name' });
      expect(input).toHaveValue('Jane Doe');
      expect(input).toBeRequired();
      expect(input).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit name' })).not.toBeInTheDocument();
    });

    it('Cancel restores the view and returns focus to Edit name without a request', async () => {
      const u2 = updateUserHandler();
      server.use(u2.handler);
      const { user } = renderProfile(ME);
      await user.click(await screen.findByRole('button', { name: 'Edit name' }));
      await user.clear(screen.getByRole('textbox', { name: 'Name' }));
      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Other');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus();
      expect(u2.requests).toHaveLength(0);
    });

    it.each([
      ['   ', 'Enter your name.'],
      ['a'.repeat(101), 'Use 100 characters or fewer.'],
    ])('rejects %j before any request', async (value, message) => {
      const u2 = updateUserHandler();
      server.use(u2.handler);
      const { user } = renderProfile(ME);
      await user.click(await screen.findByRole('button', { name: 'Edit name' }));
      const input = screen.getByRole('textbox', { name: 'Name' });
      await user.clear(input);
      await user.click(input);
      await user.paste(value);

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(u2.requests).toHaveLength(0);
    });

    it('saves the trimmed name, updates the header data, announces it and refocuses Edit name', async () => {
      const u2 = updateUserHandler();
      server.use(u2.handler);
      const { user, store } = renderProfile(ME);
      await user.click(await screen.findByRole('button', { name: 'Edit name' }));
      const input = screen.getByRole('textbox', { name: 'Name' });
      await user.clear(input);
      await user.type(input, '  Jane Roe  ');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Jane Roe')).toBeInTheDocument();
      expect(u2.requests[0]?.url.pathname).toBe('/api/v1/users/me-1');
      expect(u2.requests[0]?.body).toEqual({ name: 'Jane Roe' });
      expect(store.getState().auth.user?.name).toBe('Jane Roe');
      expect(screen.getByRole('status')).toHaveTextContent('Name updated.');
      expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus();
    });

    it('shows a server error as an alert and keeps the typed value', async () => {
      server.use(updateUserHandler(settingsErrorReply(400, 'Name is not allowed.')).handler);
      const { user, store } = renderProfile(ME);
      await user.click(await screen.findByRole('button', { name: 'Edit name' }));
      const input = screen.getByRole('textbox', { name: 'Name' });
      await user.clear(input);
      await user.type(input, 'Bad Name');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.map((a) => a.textContent)).toContain('Name is not allowed.');
      expect(input).toHaveValue('Bad Name');
      expect(store.getState().auth.user?.name).toBe('Jane Doe');
    });

    it('offers no password control (AC-41)', async () => {
      const { user, container } = renderProfile(ME);
      await user.click(await screen.findByRole('button', { name: 'Edit name' }));

      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    });
  });
});

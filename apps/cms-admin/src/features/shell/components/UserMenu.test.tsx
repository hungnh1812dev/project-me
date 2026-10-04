import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import RequireAuth from '@/features/auth/components/RequireAuth';
import type { MeUser } from '@/features/auth/types';
import { THEME_STORAGE_KEY } from '@/features/theme/theme';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import AppShell from './AppShell';

const routes = [
  { path: '/login', element: <h1>Sign in</h1> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Home</h1> },
          { path: 'profile', element: <h1>Your profile</h1> },
        ],
      },
    ],
  },
];

function renderMenu(user: MeUser = makeMeUser({ name: 'Jane Doe', email: 'jane@example.com' })) {
  return renderRoutes(routes, { route: '/admin', auth: { status: 'authenticated', user } });
}

const trigger = () => screen.findByRole('button', { name: 'Account menu' });

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('AppHeader', () => {
  it('shows the menu toggle and the account menu trigger in the banner', async () => {
    renderMenu();

    const banner = await screen.findByRole('banner');
    expect(banner).toContainElement(screen.getByRole('button', { name: 'Toggle menu' }));
    expect(banner).toContainElement(await trigger());
  });
});

describe('UserMenu', () => {
  it('shows the initials and the name on the trigger', async () => {
    renderMenu();

    const button = await trigger();
    expect(button).toHaveTextContent('JD');
    expect(button).toHaveTextContent('Jane Doe');
  });

  it('opens on click with the identity, Profile, Theme and Log out', async () => {
    const { user } = renderMenu(makeMeUser({ role: makeRole({ name: 'Editor' }) }));

    await user.click(await trigger());

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Jane Doe');
    expect(menu).toHaveTextContent('jane@example.com');
    expect(menu).toHaveTextContent('Editor');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('says "No role" for a user without one', async () => {
    const { user } = renderMenu(makeMeUser({ role: null, roleId: null }));

    await user.click(await trigger());

    expect(await screen.findByRole('menu')).toHaveTextContent('No role');
  });

  it.each(['{Enter}', ' ', '{ArrowDown}'])('opens from the keyboard with %s', async (key) => {
    const { user } = renderMenu();
    (await trigger()).focus();

    await user.keyboard(key);

    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user } = renderMenu();
    const button = await trigger();
    await user.click(button);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('goes to the profile page from Profile', async () => {
    const { user, router } = renderMenu();
    await user.click(await trigger());

    await user.click(await screen.findByRole('menuitem', { name: 'Profile' }));

    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/profile');
  });

  it('applies and stores the Dark theme', async () => {
    const { user } = renderMenu();
    await user.click(await trigger());

    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('logs out to /login with the current page as from, and clears the query cache', async () => {
    let logoutCalls = 0;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        logoutCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, router, queryClient } = renderMenu();
    queryClient.setQueryData(['probe'], 'cached');
    await user.click(await trigger());

    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ from: '/admin' });
    expect(queryClient.getQueryData(['probe'])).toBeUndefined();
    await waitFor(() => expect(logoutCalls).toBe(1));
  });
});

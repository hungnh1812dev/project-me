import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { User } from '@/features/settings/types';
import { makeMeUser, makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  deleteUserHandler,
  listRolesHandler,
  listUsersHandler,
  settingsErrorReply,
  updateUserRoleHandler,
} from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import UsersPage from './UsersPage';

const SUPER = makeRole({ documentId: 'role-super', name: 'Super Admin', level: 100 });
const ADMIN = makeRole({ documentId: 'role-admin', name: 'Admin', level: 50 });
const EDITOR = makeRole({ documentId: 'role-editor', name: 'Editor', level: 20 });
const GUEST = makeRole({ documentId: 'role-guest', name: 'Guest', level: 0 });
const ROLES = [SUPER, ADMIN, EDITOR, GUEST];

const ME = makeUser({
  documentId: 'me',
  email: 'ada@example.com',
  name: 'Ada Admin',
  username: 'ada',
  roleId: 'role-super',
});
const JANE = makeUser({
  documentId: 'user-1',
  email: 'jane@example.com',
  name: 'Jane Doe',
  username: 'janedoe',
  roleId: 'role-editor',
  // Midday UTC, so the local date is the same in every test time zone.
  createdAt: '2026-01-15T12:00:00.000Z',
});
const JOHN = makeUser({
  documentId: 'user-2',
  email: 'john@example.com',
  name: 'John Smith',
  username: 'john',
  roleId: null,
  verified: false,
});
const ZED = makeUser({
  documentId: 'user-3',
  email: 'zed@example.com',
  name: 'Zed Ghost',
  username: 'zed',
  roleId: 'role-gone',
});
const USERS = [ZED, JOHN, ME, JANE];

const ALL = ['user:read', 'user:manager', 'user:role_manager', 'role:read'];

function auth(permissions: string[] = ALL, level = 100) {
  return {
    status: 'authenticated' as const,
    user: makeMeUser({
      documentId: 'me',
      email: 'ada@example.com',
      name: 'Ada Admin',
      roleId: 'role-super',
      role: makeRole({ documentId: 'role-super', permissions, level }),
    }),
  };
}

/** Installs U1 and R1 over a mutable user list, so a refetch sees deletes and role changes. */
function mockApi(users: User[] = [...USERS]) {
  const store = { users };
  const u1 = listUsersHandler(() => HttpResponse.json(store.users));
  const r1 = listRolesHandler(() => HttpResponse.json(ROLES));
  server.use(u1.handler, r1.handler);
  return { store, u1, r1 };
}

async function renderPage(permissions = ALL, level = 100) {
  const view = renderWithProviders(<UsersPage />, { auth: auth(permissions, level) });
  await screen.findByRole('table');
  return view;
}

const rowOf = (email: string) => screen.getByRole('row', { name: new RegExp(email) });

describe('UsersPage list (AC-2, AC-12, AC-13, AC-17)', () => {
  it('renders the heading, a description and a captioned table with column headers', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText(/Assign roles and remove accounts/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Users' })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((th) => th.textContent)).toEqual([
      'Name',
      'Username',
      'Email',
      'Verified',
      'Role',
      'Created',
      'Actions',
    ]);
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('sorts by name and joins each role, with "No role" and "Unknown"', async () => {
    mockApi();
    await renderPage();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Ada AdminYou',
      'Jane Doe',
      'John Smith',
      'Zed Ghost',
    ]);
    expect(within(rowOf('jane@example.com')).getByText('Editor')).toBeInTheDocument();
    expect(within(rowOf('john@example.com')).getByText('No role')).toBeInTheDocument();
    expect(within(rowOf('zed@example.com')).getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the verified state in text, the created date and a "You" badge on the own row', async () => {
    mockApi();
    await renderPage();

    expect(within(rowOf('jane@example.com')).getByText('Verified')).toBeInTheDocument();
    expect(within(rowOf('john@example.com')).getByText('Not verified')).toBeInTheDocument();
    expect(within(rowOf('jane@example.com')).getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(within(rowOf('ada@example.com')).getByText('You')).toBeInTheDocument();
    expect(within(rowOf('jane@example.com')).queryByText('You')).not.toBeInTheDocument();
  });

  it('puts the table in a labelled, focusable scroll region', async () => {
    mockApi();
    await renderPage();

    const region = screen.getByRole('region', { name: 'Users table' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByRole('table'));
  });

  it('names each row action after its user and offers no name or password control', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('button', { name: 'Change role for jane@example.com' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete jane@example.com' })).toBeVisible();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|rename/i })).not.toBeInTheDocument();
  });
});

describe('UsersPage search (AC-4)', () => {
  it.each([
    ['name', 'smith', ['John Smith']],
    ['username', 'JANEDOE', ['Jane Doe']],
    ['email', 'zed@', ['Zed Ghost']],
  ])('filters by %s without a request and announces the count', async (_, query, names) => {
    const { u1 } = mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), query);

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(names);
    expect(screen.getByText('1 user')).toBeInTheDocument();
    expect(u1.requests).toHaveLength(1);
  });

  it('shows the no-match state', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox'), 'nobody');

    expect(screen.getByText('No users match "nobody".')).toBeInTheDocument();
  });
});

describe('UsersPage states (AC-3)', () => {
  it('shows busy skeleton rows while loading', async () => {
    server.use(
      listUsersHandler(() => new Promise<Response>(() => {})).handler,
      listRolesHandler().handler,
    );
    renderWithProviders(<UsersPage />, { auth: auth() });

    expect(await screen.findByRole('group', { name: 'Loading users' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows an error with Retry that refetches', async () => {
    let fail = true;
    const u1 = listUsersHandler((request) =>
      fail ? settingsErrorReply(500, 'Server exploded.')(request) : HttpResponse.json(USERS),
    );
    server.use(u1.handler, listRolesHandler().handler);
    const { user } = renderWithProviders(<UsersPage />, { auth: auth() });

    // A 5xx is retried once (about a second) before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Server exploded.',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('shows "no access" without Retry on a server 403', async () => {
    server.use(
      listUsersHandler(settingsErrorReply(403, 'Forbidden resource')).handler,
      listRolesHandler().handler,
    );
    renderWithProviders(<UsersPage />, { auth: auth() });

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to users.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockApi([]);
    renderWithProviders(<UsersPage />, { auth: auth() });

    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });
});

describe('UsersPage gating (AC-5, AC-14 to AC-16)', () => {
  it('disables every action for a read-only actor, with the reason', async () => {
    mockApi();
    await renderPage(['user:read', 'role:read'], 50);

    const change = screen.getByRole('button', { name: 'Change role for jane@example.com' });
    const remove = screen.getByRole('button', { name: 'Delete jane@example.com' });
    expect(change).toHaveAttribute('aria-disabled', 'true');
    expect(change).toHaveAccessibleDescription('Requires the "user:role_manager" permission.');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription('Requires the "user:manager" permission.');
  });

  it('denies both actions on the own row', async () => {
    mockApi();
    await renderPage();

    expect(
      screen.getByRole('button', { name: 'Change role for ada@example.com' }),
    ).toHaveAccessibleDescription('You cannot change your own role.');
    expect(
      screen.getByRole('button', { name: 'Delete ada@example.com' }),
    ).toHaveAccessibleDescription('You cannot delete your own account.');
  });

  it('denies actions on a row whose role is unknown', async () => {
    mockApi();
    await renderPage();

    expect(
      screen.getByRole('button', { name: 'Delete zed@example.com' }),
    ).toHaveAccessibleDescription('Requires a higher role level than the target user.');
  });

  it('without role:read: no R1 request, roles show "Unknown" and their actions are denied', async () => {
    const { r1 } = mockApi();
    await renderPage(['user:read', 'user:manager', 'user:role_manager']);

    expect(r1.requests).toHaveLength(0);
    expect(within(rowOf('jane@example.com')).getByText('Unknown')).toBeInTheDocument();
    expect(within(rowOf('john@example.com')).getByText('No role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete jane@example.com' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Change role for jane@example.com' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows actions on a lower user', async () => {
    mockApi();
    await renderPage();

    expect(
      screen.getByRole('button', { name: 'Change role for jane@example.com' }),
    ).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Delete john@example.com' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('UsersPage change role (AC-7 to AC-11, AC-15)', () => {
  it('lists only lower roles, highest first, with the current one preselected', async () => {
    mockApi();
    const { user } = await renderPage(ALL, 50);

    await user.click(screen.getByRole('button', { name: 'Change role for jane@example.com' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Change the role of jane@example.com?',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const select = within(dialog).getByRole('combobox', { name: 'Role' });
    expect(select).toHaveTextContent('Editor (level 20)');
    await user.click(select);
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Editor (level 20)',
      'Guest (level 0)',
    ]);
  });

  it('sends U3 { roleId }, closes, announces and refetches the list', async () => {
    const { store, u1 } = mockApi();
    const u3 = updateUserRoleHandler(({ params, body }) => {
      const roleId = (body as { roleId: string }).roleId;
      store.users = store.users.map((u) => (u.documentId === params.id ? { ...u, roleId } : u));
      return HttpResponse.json(store.users.find((u) => u.documentId === params.id));
    });
    server.use(u3.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Change role for jane@example.com' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'Guest (level 0)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(u3.requests[0]?.body).toEqual({ roleId: 'role-guest' });
    expect(u3.requests[0]?.params.id).toBe('user-1');
    expect(
      await screen.findByText('Role of jane@example.com changed to Guest.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(rowOf('jane@example.com')).getByText('Guest')).toBeInTheDocument(),
    );
    expect(u1.requests.length).toBeGreaterThan(1);
  });

  it('shows a server 403 inside the dialog and keeps it open', async () => {
    mockApi();
    server.use(updateUserRoleHandler(settingsErrorReply(403, 'Role level too high.')).handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Change role for jane@example.com' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Role level too high.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('asks for a role when the current one is not assignable', async () => {
    mockApi();
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);
    const { user } = await renderPage(ALL, 50);

    await user.click(screen.getByRole('button', { name: 'Change role for john@example.com' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Change role' }));

    expect(await within(dialog).findByText('Choose a role.')).toBeInTheDocument();
    expect(u3.requests).toHaveLength(0);
  });

  it('returns focus to the row button on Cancel', async () => {
    mockApi();
    const { user } = await renderPage();
    const trigger = screen.getByRole('button', { name: 'Change role for jane@example.com' });

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('UsersPage delete (AC-7, AC-10, AC-11, AC-16)', () => {
  it('confirms naming the email, sends U4 and removes the row', async () => {
    const { store } = mockApi();
    const u4 = deleteUserHandler(({ params }) => {
      store.users = store.users.filter((u) => u.documentId !== params.id);
      return new HttpResponse(null, { status: 204 });
    });
    server.use(u4.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete jane@example.com' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete jane@example.com?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(u4.requests[0]?.params.id).toBe('user-1');
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /jane@example.com/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('User jane@example.com deleted.')).toBeInTheDocument();
  });

  it('shows a server error inside the dialog', async () => {
    mockApi();
    server.use(deleteUserHandler(settingsErrorReply(404, 'User not found.')).handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete jane@example.com' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('User not found.');
  });

  it('does nothing when a denied Delete is activated', async () => {
    mockApi();
    const u4 = deleteUserHandler();
    server.use(u4.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete ada@example.com' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(u4.requests).toHaveLength(0);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Role } from '@/features/auth/types';
import { makeMeUser, makePermission, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createRoleHandler,
  deleteRoleHandler,
  listPermissionsHandler,
  listRolesHandler,
  settingsErrorReply,
  updateRoleHandler,
} from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import RolesPage from './RolesPage';

const SUPER = makeRole({
  documentId: 'role-super',
  name: 'Super admin',
  slug: 'super_admin',
  level: 100,
  isDefault: true,
  permissions: ['role:read', 'role:manager', 'permission:read'],
});
const ADMIN = makeRole({
  documentId: 'role-admin',
  name: 'Admin',
  slug: 'admin',
  level: 50,
  isDefault: true,
  permissions: ['role:read'],
});
const EDITOR = makeRole();
const WRITER = makeRole({
  documentId: 'role-writer',
  name: 'Writer',
  slug: 'writer',
  level: 10,
  permissions: ['document:read:article', 'role:read', 'document:read'],
});
const AUTHOR = makeRole({
  documentId: 'role-author',
  name: 'author',
  slug: 'author',
  level: 10,
  permissions: ['document:read'],
});
const ROLES = [WRITER, EDITOR, SUPER, AUTHOR, ADMIN];

const CATALOG = [
  makePermission({ documentId: 'p1', slug: 'document:read', name: 'Read documents' }),
  makePermission({ documentId: 'p2', slug: 'document:read:article', name: 'Read articles' }),
  makePermission({ documentId: 'p3', slug: 'role:read', name: 'Read roles' }),
  makePermission({ documentId: 'p4', slug: 'role:manager', name: 'Manage roles' }),
];

const MANAGER = ['role:read', 'role:manager', 'permission:read'];

function auth(permissions: string[] = MANAGER) {
  return {
    status: 'authenticated' as const,
    user: makeMeUser({ roleId: 'role-me', role: makeRole({ documentId: 'role-me', permissions }) }),
  };
}

/** Installs R1 over a mutable list and P1 over the catalog. */
function mockApi(roles: Role[] = [...ROLES]) {
  const store = { roles };
  const r1 = listRolesHandler(() => HttpResponse.json(store.roles));
  server.use(r1.handler, listPermissionsHandler(() => HttpResponse.json(CATALOG)).handler);
  return { store, r1 };
}

async function renderPage(permissions = MANAGER) {
  const view = renderWithProviders(<RolesPage />, { auth: auth(permissions) });
  await screen.findByRole('table', { name: 'Roles' });
  return view;
}

const namesInOrder = () =>
  within(screen.getByRole('table', { name: 'Roles' }))
    .getAllByRole('row')
    .slice(1)
    .filter((row) => !row.hasAttribute('data-details'))
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

const rowOf = (name: string) =>
  screen
    .getAllByRole('row')
    .find((row) => within(row).queryAllByRole('cell')[0]?.textContent?.startsWith(name));

describe('RolesPage list (AC-2, AC-12, AC-18)', () => {
  it('renders the heading, a description and New role', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Roles' })).toBeInTheDocument();
    expect(screen.getByText(/bundle permissions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New role' })).toBeVisible();
  });

  it('sorts by level descending, then by name, with a Default badge', async () => {
    mockApi();
    await renderPage();

    expect(namesInOrder()).toEqual([
      'Super adminDefault',
      'AdminDefault',
      'Editor',
      'author',
      'Writer',
    ]);
  });

  it('shows the slug in monospace, the level and the permission count, with scoped headers', async () => {
    mockApi();
    await renderPage();

    const cells = within(rowOf('Writer') as HTMLElement).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('writer');
    expect(cells[1]?.querySelector('code')).not.toBeNull();
    expect(cells[2]).toHaveTextContent('10');
    expect(cells[3]).toHaveTextContent('3 permissions');
    within(screen.getByRole('table', { name: 'Roles' }))
      .getAllByRole('columnheader')
      .forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    expect(screen.getByRole('region', { name: 'Roles table' })).toHaveAttribute('tabindex', '0');
    expect(within(rowOf('Admin') as HTMLElement).getByText('1 permission')).toBeInTheDocument();
  });

  it('expands a row to show its permissions grouped by resource, read-only', async () => {
    mockApi();
    const { user } = await renderPage();
    const toggle = screen.getByRole('button', { name: 'Writer: 3 permissions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('region', { name: 'Writer permissions' });
    expect(toggle).toHaveAttribute('aria-controls', details.id);
    expect(
      within(within(details).getByRole('list', { name: 'document' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['document:read', 'document:read:article']);
    expect(
      within(within(details).getByRole('list', { name: 'role' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['role:read']);
    expect(within(details).getAllByRole('list')).toHaveLength(2);
    expect(within(details).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Writer permissions' })).not.toBeInTheDocument();
  });

  it('says so when an expanded role has no permissions', async () => {
    mockApi([makeRole({ permissions: [] })]);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Editor: 0 permissions' }));

    expect(screen.getByText('This role grants no permissions.')).toBeInTheDocument();
  });

  it('names each row action after the role', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('button', { name: 'Edit Writer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete Writer' })).toBeVisible();
  });
});

describe('RolesPage search and states (AC-3, AC-4, AC-18)', () => {
  it.each([
    ['name', 'WRIT', ['Writer']],
    ['slug', 'super_', ['Super adminDefault']],
  ])('filters by %s without a request', async (_, query, names) => {
    const { r1 } = mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search roles' }), query);

    expect(namesInOrder()).toEqual(names);
    expect(screen.getByText('1 role')).toBeInTheDocument();
    expect(r1.requests).toHaveLength(1);
  });

  it('shows the no-match state', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox'), 'nothing');

    expect(screen.getByText('No roles match "nothing".')).toBeInTheDocument();
  });

  it('shows "no access" without Retry on a server 403', async () => {
    server.use(listRolesHandler(settingsErrorReply(403, 'Forbidden resource')).handler);
    renderWithProviders(<RolesPage />, { auth: auth() });

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to roles.");
  });

  it('shows the empty state with the primary action', async () => {
    mockApi([]);
    renderWithProviders(<RolesPage />, { auth: auth() });

    expect(await screen.findByText('No roles yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New role' })).toHaveLength(2);
  });
});

describe('RolesPage gating (AC-5, AC-21)', () => {
  it('disables every write control for a read-only actor, with the reason', async () => {
    mockApi();
    const { user } = await renderPage(['role:read']);
    const reason = 'Requires the "role:manager" permission.';

    for (const name of ['New role', 'Edit Writer', 'Delete Writer']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(reason);
    }
    await user.click(screen.getByRole('button', { name: 'Edit Writer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables Delete for a default role with the reason, and keeps Edit', async () => {
    mockApi();
    await renderPage();

    const remove = screen.getByRole('button', { name: 'Delete Admin' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription('A default role cannot be deleted.');
    expect(screen.getByRole('button', { name: 'Edit Admin' })).not.toHaveAttribute('aria-disabled');
  });
});

describe('RolesPage create (AC-8 to AC-11, AC-19)', () => {
  async function openCreate() {
    const view = await renderPage();
    await view.user.click(screen.getByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('dialog', { name: 'New role' });
    return { ...view, dialog };
  }

  it('opens a modal form with the name focused, the slug help and the permission tree', async () => {
    mockApi();
    const { dialog } = await openCreate();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus(),
    );
    expect(within(dialog).getByRole('textbox', { name: 'Slug' })).toHaveAccessibleDescription(
      "Derived from the name until you edit it. It can't be changed later.",
    );
    expect(await within(dialog).findByRole('checkbox', { name: 'Select all' })).toBeVisible();
  });

  it('derives the slug from the name until the slug is edited', async () => {
    mockApi();
    const { user, dialog } = await openCreate();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });

    await user.type(name, 'Content Writer!');
    expect(slug).toHaveValue('content-writer');

    await user.clear(slug);
    await user.type(slug, 'writers');
    await user.type(name, ' 2');
    expect(slug).toHaveValue('writers');
  });

  it('validates on submit, then on change, without a request', async () => {
    mockApi();
    const r2 = createRoleHandler();
    server.use(r2.handler);
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a slug.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a level.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Level' }), '101');
    expect(within(dialog).getByText('Use a whole number from 0 to 100.')).toBeInTheDocument();
    expect(r2.requests).toHaveLength(0);
  });

  it('sends R2 with the picked permissions, closes, announces and refetches', async () => {
    const { store, r1 } = mockApi();
    const r2 = createRoleHandler(({ body }) => {
      const created = makeRole({ documentId: 'role-new', ...(body as object) });
      store.roles = [...store.roles, created];
      return HttpResponse.json(created, { status: 201 });
    });
    server.use(r2.handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Content writer ');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Level' }), '15');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'document' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(r2.requests[0]?.body).toEqual({
      name: 'Content writer',
      slug: 'content-writer',
      permissions: ['document:read', 'document:read:article'],
      level: 15,
    });
    expect(await screen.findByText('Role "Content writer" created.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit Content writer' })).toBeVisible();
    expect(r1.requests.length).toBeGreaterThan(1);
  });

  it('shows a duplicate-slug 409 on Slug, and clears it when the slug changes', async () => {
    mockApi();
    server.use(createRoleHandler(settingsErrorReply(409, 'Slug exists')).handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Writer');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Level' }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));

    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });
    await waitFor(() =>
      expect(slug).toHaveAccessibleDescription(
        expect.stringContaining('A role with this slug already exists.'),
      ),
    );
    await user.type(slug, '-2');
    expect(within(dialog).queryByText('A role with this slug already exists.')).toBeNull();
  });

  it('shows a 400 server message as an alert in the dialog', async () => {
    mockApi();
    server.use(createRoleHandler(settingsErrorReply(400, 'Unknown permission slug')).handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Writer 2');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Level' }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unknown permission slug');
  });

  it('shows the read-only permissions note without permission:read', async () => {
    mockApi();
    const { user } = await renderPage(['role:read', 'role:manager']);
    await user.click(screen.getByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('dialog', { name: 'New role' });

    expect(
      within(dialog).getByText('Requires the "permission:read" permission to change permissions.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('RolesPage edit (AC-20)', () => {
  async function openEdit(name: string) {
    const view = await renderPage();
    await view.user.click(screen.getByRole('button', { name: `Edit ${name}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit role' });
    return { ...view, dialog };
  }

  it('makes Slug read-only and disables Save until something changes', async () => {
    mockApi();
    const { user, dialog } = await openEdit('Writer');

    expect(within(dialog).getByRole('textbox', { name: 'Slug' })).toHaveAttribute('readonly');
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await user.clear(within(dialog).getByRole('spinbutton', { name: 'Level' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Level' }), '10');
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' ');
    expect(save).toBeDisabled();
  });

  it('sends R3 with only the changed fields, closes and announces', async () => {
    mockApi();
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { user, dialog } = await openEdit('Writer');

    const level = within(dialog).getByRole('spinbutton', { name: 'Level' });
    await user.clear(level);
    await user.type(level, '30{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(r3.requests[0]?.params.id).toBe('role-writer');
    expect(r3.requests[0]?.body).toEqual({ level: 30 });
    expect(await screen.findByText('Role "Writer" updated.')).toBeInTheDocument();
  });

  it('disables the name and level of a default role, with the help text, but not its permissions', async () => {
    mockApi();
    const r3 = updateRoleHandler();
    server.use(r3.handler);
    const { user, dialog } = await openEdit('Admin');
    const help = 'The name and level of a default role cannot be changed.';

    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(help);
    expect(within(dialog).getByRole('spinbutton', { name: 'Level' })).toBeDisabled();
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'role:manager Manage roles' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(r3.requests[0]?.body).toEqual({ permissions: ['role:read', 'role:manager'] });
  });

  it('shows a server error in the dialog', async () => {
    mockApi();
    server.use(updateRoleHandler(settingsErrorReply(404, 'Role not found')).handler);
    const { user, dialog } = await openEdit('Writer');

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 's');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Role not found');
  });
});

describe('RolesPage delete (AC-7, AC-10, AC-21)', () => {
  it('confirms, sends R4, announces and drops the row', async () => {
    const { store } = mockApi();
    const r4 = deleteRoleHandler(({ params }) => {
      store.roles = store.roles.filter((role) => role.documentId !== params.id);
      return new HttpResponse(null, { status: 204 });
    });
    server.use(r4.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Writer' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete role "Writer"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete role' }));

    expect(await screen.findByText('Role "Writer" deleted.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete Writer' })).not.toBeInTheDocument(),
    );
    expect(r4.requests).toHaveLength(1);
  });
});

describe('RolesPage paging (Phase 6 AC-21, AC-24 to AC-26)', () => {
  /** `count` roles "Role 01"… with levels count..1, so the list order is Role 01 first. */
  const manyRoles = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return makeRole({
        documentId: `role-${n}`,
        name: `Role ${n}`,
        slug: `role_${n}`,
        level: count - i,
        permissions: ['role:read'],
      });
    });

  async function renderAt(route: string) {
    const view = renderWithProviders(<RolesPage />, { auth: auth(), route });
    await screen.findByRole('table', { name: 'Roles' });
    return view;
  }

  it('shows 10 roles, and an expanded permission row does not count as a row', async () => {
    mockApi(manyRoles(12));
    const { user } = await renderAt('/');

    expect(namesInOrder()).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Role 01: 1 permission' }));
    expect(screen.getByRole('region', { name: 'Role 01 permissions' })).toBeInTheDocument();
    expect(namesInOrder()).toHaveLength(10);

    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    await user.click(within(nav).getByRole('button', { name: 'Next page' }));
    expect(namesInOrder()).toEqual(['Role 11', 'Role 12']);
  });

  it('goes back to page 1 when the search changes', async () => {
    mockApi(manyRoles(12));
    const { user } = await renderAt('/?page=2');
    expect(namesInOrder()).toEqual(['Role 11', 'Role 12']);

    await user.type(screen.getByRole('searchbox', { name: 'Search roles' }), 'role');

    await waitFor(() => expect(namesInOrder()).toHaveLength(10));
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 1 of 2');
  });

  it('moves to the new last page when a delete empties the current one', async () => {
    const { store } = mockApi(manyRoles(11));
    server.use(
      deleteRoleHandler(({ params }) => {
        store.roles = store.roles.filter((role) => role.documentId !== params.id);
        return new HttpResponse(null, { status: 204 });
      }).handler,
    );
    const { user } = await renderAt('/?page=2');
    expect(namesInOrder()).toEqual(['Role 11']);

    await user.click(screen.getByRole('button', { name: 'Delete Role 11' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete role' }));

    expect(await screen.findByText('Role "Role 11" deleted.')).toBeInTheDocument();
    await waitFor(() => expect(namesInOrder()).toHaveLength(10));
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 1 of 1');
  });
});

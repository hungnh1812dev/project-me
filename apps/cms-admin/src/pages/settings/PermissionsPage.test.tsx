import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Permission } from '@/features/settings/types';
import { makeMeUser, makePermission, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createPermissionHandler,
  deletePermissionHandler,
  listPermissionsHandler,
  settingsErrorReply,
  updatePermissionHandler,
} from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import PermissionsPage from './PermissionsPage';

const DOC_READ = makePermission({
  documentId: 'perm-doc-read',
  slug: 'document:read',
  name: 'Read documents',
  description: 'List and open documents.',
});
const DOC_CREATE = makePermission({
  documentId: 'perm-doc-create',
  slug: 'document:create',
  name: 'Create documents',
  description: 'Add new documents.',
});
const ROLE_READ = makePermission({
  documentId: 'perm-role-read',
  slug: 'role:read',
  name: 'Read roles',
  description: 'List roles.',
});
const MEDIA_READ = makePermission({
  documentId: 'perm-media-read',
  slug: 'media:read',
  name: 'Browse media',
  description: null,
});
const CATALOG = [ROLE_READ, DOC_READ, MEDIA_READ, DOC_CREATE];

const MANAGER = ['permission:read', 'permission:manager', 'role:read', 'api_token:read'];

function auth(permissions: string[] = MANAGER) {
  return {
    status: 'authenticated' as const,
    user: makeMeUser({ role: makeRole({ permissions }) }),
  };
}

/** Installs P1 over a mutable catalog, so a refetch sees creates, edits and deletes. */
function mockApi(permissions: Permission[] = [...CATALOG]) {
  const store = { permissions };
  const p1 = listPermissionsHandler(() => HttpResponse.json(store.permissions));
  server.use(p1.handler);
  return { store, p1 };
}

async function renderPage(permissions = MANAGER) {
  const view = renderWithProviders(<PermissionsPage />, { auth: auth(permissions) });
  await screen.findAllByRole('table');
  return view;
}

const rowOf = (slug: string) => screen.getByRole('row', { name: new RegExp(slug) });
const slugsIn = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('PermissionsPage list (AC-2, AC-12, AC-24)', () => {
  it('renders the heading, a description and the New permission action', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Permissions' })).toBeInTheDocument();
    expect(screen.getByText(/permission catalog/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New permission' })).toBeVisible();
  });

  it('groups by resource in collapsible sections with counts, sorted by slug', async () => {
    mockApi();
    await renderPage();

    const groups = screen.getAllByRole('group');
    expect(groups.map((group) => group.querySelector('summary')?.textContent)).toEqual([
      'document2 permissions',
      'media1 permission',
      'role1 permission',
    ]);
    expect(slugsIn(screen.getByRole('table', { name: 'document permissions' }))).toEqual([
      'document:create',
      'document:read',
    ]);
    groups.forEach((group) => expect(group).toHaveAttribute('open'));
  });

  it('collapses a section from its summary', async () => {
    mockApi();
    const { user } = await renderPage();
    const group = screen.getAllByRole('group')[0] as HTMLDetailsElement;

    await user.click(within(group).getByText('document'));

    expect(group.open).toBe(false);
  });

  it('shows slug in monospace, name and description, with captioned tables and scoped headers', async () => {
    mockApi();
    await renderPage();

    const row = rowOf('document:read');
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('document:read');
    expect(cells[0]?.querySelector('code')).not.toBeNull();
    expect(cells[1]).toHaveTextContent('Read documents');
    expect(cells[2]).toHaveTextContent('List and open documents.');
    const table = screen.getByRole('table', { name: 'role permissions' });
    within(table)
      .getAllByRole('columnheader')
      .forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    expect(screen.getByRole('region', { name: 'role permissions table' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('names each row action after its slug', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('button', { name: 'Edit role:read' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete role:read' })).toBeVisible();
  });
});

describe('PermissionsPage search (AC-4, AC-24)', () => {
  it.each([
    ['slug', 'ROLE:', ['role:read']],
    ['name', 'browse', ['media:read']],
    ['description', 'new documents', ['document:create']],
  ])('filters by %s without a request and announces the count', async (_, query, slugs) => {
    const { p1 } = mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search permissions' }), query);

    const tables = screen.getAllByRole('table');
    expect(tables.flatMap(slugsIn)).toEqual(slugs);
    expect(screen.getByText('1 permission')).toBeInTheDocument();
    expect(p1.requests).toHaveLength(1);
  });

  it('shows the no-match state', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox'), 'nothing');

    expect(screen.getByText('No permissions match "nothing".')).toBeInTheDocument();
  });
});

describe('PermissionsPage states (AC-3)', () => {
  it('shows busy skeleton rows while loading', async () => {
    server.use(listPermissionsHandler(() => new Promise<Response>(() => {})).handler);
    renderWithProviders(<PermissionsPage />, { auth: auth() });

    expect(await screen.findByRole('group', { name: 'Loading permissions' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows an error with Retry that refetches', async () => {
    let fail = true;
    server.use(
      listPermissionsHandler((request) =>
        fail ? settingsErrorReply(500, 'Server exploded.')(request) : HttpResponse.json(CATALOG),
      ).handler,
    );
    const { user } = renderWithProviders(<PermissionsPage />, { auth: auth() });

    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Server exploded.',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table', { name: 'role permissions' })).toBeInTheDocument();
  });

  it('shows "no access" without Retry on a server 403', async () => {
    server.use(listPermissionsHandler(settingsErrorReply(403, 'Forbidden resource')).handler);
    renderWithProviders(<PermissionsPage />, { auth: auth() });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to permissions.",
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the empty state with the primary action', async () => {
    mockApi([]);
    renderWithProviders(<PermissionsPage />, { auth: auth() });

    expect(await screen.findByText('No permissions yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New permission' })).toHaveLength(2);
  });
});

describe('PermissionsPage gating (AC-5)', () => {
  it('disables every write control for a read-only actor, with the reason', async () => {
    mockApi();
    const { user } = await renderPage(['permission:read']);
    const reason = 'Requires the "permission:manager" permission.';

    for (const name of ['New permission', 'Edit role:read', 'Delete role:read']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(reason);
    }
    await user.click(screen.getByRole('button', { name: 'New permission' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PermissionsPage create (AC-8 to AC-11, AC-25)', () => {
  async function openCreate() {
    const view = await renderPage();
    await view.user.click(screen.getByRole('button', { name: 'New permission' }));
    const dialog = await screen.findByRole('dialog', { name: 'New permission' });
    return { ...view, dialog };
  }

  it('opens a modal form with the help text, the counter and the info alert', async () => {
    mockApi();
    const { dialog } = await openCreate();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });
    expect(slug).toHaveAccessibleDescription(
      "resource:action, lowercase. It can't be changed later.",
    );
    await waitFor(() => expect(slug).toHaveFocus());
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveAttribute(
      'maxlength',
      '500',
    );
    expect(within(dialog).getByText('0 / 500')).toBeInTheDocument();
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Creating a permission grants nothing by itself. The API must check this slug before it has any effect.',
    );
  });

  it('validates on submit, then on change, without a request', async () => {
    mockApi();
    const p2 = createPermissionHandler();
    server.use(p2.handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Slug' }), 'Bad Slug');
    await user.click(within(dialog).getByRole('button', { name: 'Create permission' }));

    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });
    expect(slug).toHaveAttribute('aria-invalid', 'true');
    expect(slug).toHaveAccessibleDescription(
      expect.stringContaining('Use resource:action in lowercase, for example article:export.'),
    );
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a description.')).toBeInTheDocument();
    expect(p2.requests).toHaveLength(0);

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'X');
    expect(within(dialog).queryByText('Enter a name.')).not.toBeInTheDocument();
  });

  it('sends P2 with trimmed values on Enter, closes, announces and refetches', async () => {
    const { store, p1 } = mockApi();
    const p2 = createPermissionHandler(({ body }) => {
      const created = makePermission({ documentId: 'perm-new', ...(body as object) });
      store.permissions = [...store.permissions, created];
      return HttpResponse.json(created, { status: 201 });
    });
    server.use(p2.handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Slug' }), 'article:export');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Export articles ');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Description' }),
      'Download as CSV.',
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(p2.requests).toHaveLength(1);
    expect(p2.requests[0]?.body).toEqual({
      slug: 'article:export',
      name: 'Export articles',
      description: 'Download as CSV.',
    });
    expect(await screen.findByText('Permission "article:export" created.')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'article permissions' })).toBeInTheDocument();
    expect(p1.requests.length).toBeGreaterThan(1);
  });

  it('shows a duplicate-slug 409 on the Slug field and keeps the dialog open', async () => {
    mockApi();
    server.use(createPermissionHandler(settingsErrorReply(409, 'Slug exists')).handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Slug' }), 'role:read');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Dup');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Dup.');
    await user.click(within(dialog).getByRole('button', { name: 'Create permission' }));

    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });
    await waitFor(() =>
      expect(slug).toHaveAccessibleDescription(
        expect.stringContaining('A permission with this slug already exists.'),
      ),
    );
    expect(slug).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1);

    await user.type(slug, 'x');
    expect(within(dialog).queryByText('A permission with this slug already exists.')).toBeNull();
  });

  it('shows another server error as an alert inside the dialog', async () => {
    mockApi();
    server.use(createPermissionHandler(settingsErrorReply(400, 'Bad payload.')).handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Slug' }), 'a:b');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'B');
    await user.click(within(dialog).getByRole('button', { name: 'Create permission' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bad payload.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns focus to New permission on Cancel', async () => {
    mockApi();
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New permission' })).toHaveFocus(),
    );
  });
});

describe('PermissionsPage edit (AC-9, AC-10, AC-26)', () => {
  async function openEdit(slug = 'role:read') {
    const view = await renderPage();
    await view.user.click(screen.getByRole('button', { name: `Edit ${slug}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit permission' });
    return { ...view, dialog };
  }

  it('prefills the values with a read-only slug and focuses Name', async () => {
    mockApi();
    const { dialog } = await openEdit();

    const slug = within(dialog).getByRole('textbox', { name: 'Slug' });
    expect(slug).toHaveValue('role:read');
    expect(slug).toHaveAttribute('readonly');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Read roles');
    await waitFor(() => expect(name).toHaveFocus());
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue('List roles.');
  });

  it('sends P3 with only the changed fields, closes and announces', async () => {
    mockApi();
    const p3 = updatePermissionHandler();
    server.use(p3.handler);
    const { user, dialog } = await openEdit();

    const description = within(dialog).getByRole('textbox', { name: 'Description' });
    await user.clear(description);
    await user.type(description, 'List every role.');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(p3.requests[0]?.params.id).toBe('perm-role-read');
    expect(p3.requests[0]?.body).toEqual({ description: 'List every role.' });
    expect(await screen.findByText('Permission "role:read" updated.')).toBeInTheDocument();
  });

  it('closes without a request when nothing changed', async () => {
    mockApi();
    const p3 = updatePermissionHandler();
    server.use(p3.handler);
    const { user, dialog } = await openEdit();

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(p3.requests).toHaveLength(0);
  });

  it('accepts a permission with no description once one is entered', async () => {
    mockApi();
    const p3 = updatePermissionHandler();
    server.use(p3.handler);
    const { user, dialog } = await openEdit('media:read');

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(within(dialog).getByText('Enter a description.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Browse.');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(p3.requests[0]?.body).toEqual({ description: 'Browse.' }));
  });

  it('shows a server 404 inside the dialog', async () => {
    mockApi();
    server.use(updatePermissionHandler(settingsErrorReply(404, 'Permission not found')).handler);
    const { user, dialog } = await openEdit();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '!');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Permission not found');
  });
});

describe('PermissionsPage delete (AC-7, AC-10, AC-11, AC-27)', () => {
  it('confirms naming the slug, sends P4 and removes the row', async () => {
    const { store } = mockApi();
    const p4 = deletePermissionHandler(({ params }) => {
      store.permissions = store.permissions.filter((p) => p.documentId !== params.id);
      return new HttpResponse(null, { status: 204 });
    });
    server.use(p4.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete media:read' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete media:read?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete permission' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(p4.requests[0]?.params.id).toBe('perm-media-read');
    expect(await screen.findByText('Permission "media:read" deleted.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'media permissions' })).not.toBeInTheDocument(),
    );
  });

  it('shows the conflict counts on a 409 and keeps the row', async () => {
    mockApi();
    server.use(
      deletePermissionHandler(() =>
        HttpResponse.json(
          { statusCode: 409, message: 'In use', roleCount: 1, accessTokenCount: 2 },
          { status: 409 },
        ),
      ).handler,
    );
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete role:read' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete permission' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This permission is still used by 1 role and 2 access tokens. Remove it from them first.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(rowOf('role:read')).toBeInTheDocument();
  });
});

describe('PermissionsPage paging by rows (Phase 6 AC-22, AC-24 to AC-26)', () => {
  /** `docs` document permissions, then `roles` role permissions, unsorted. */
  const many = (docs: number, roles: number) =>
    [
      ...Array.from({ length: roles }, (_, i) => `role:r${i + 1}`),
      ...Array.from({ length: docs }, (_, i) => `document:d${String(i + 1).padStart(2, '0')}`),
    ].map((slug) =>
      makePermission({ documentId: `perm-${slug}`, slug, name: slug, description: null }),
    );

  const summaries = () =>
    screen.getAllByRole('group').map((group) => group.querySelector('summary')?.textContent);

  async function renderAt(route: string) {
    const view = renderWithProviders(<PermissionsPage />, { auth: auth(), route });
    await screen.findAllByRole('table');
    return view;
  }

  it('pages 10 rows sorted by slug, and a split group keeps its full count on both pages', async () => {
    mockApi(many(8, 4));
    const { user } = await renderAt('/');

    expect(summaries()).toEqual(['document8 permissions', 'role4 permissions']);
    expect(slugsIn(screen.getByRole('table', { name: 'role permissions' }))).toEqual([
      'role:r1',
      'role:r2',
    ]);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav).toHaveTextContent('Showing 1–10 of 12');

    await user.click(within(nav).getByRole('button', { name: 'Next page' }));

    expect(summaries()).toEqual(['role4 permissions']);
    expect(slugsIn(screen.getByRole('table', { name: 'role permissions' }))).toEqual([
      'role:r3',
      'role:r4',
    ]);
  });

  it('counts only the rows that match the search, and goes back to page 1', async () => {
    mockApi(many(8, 4));
    const { user } = await renderAt('/?page=2');

    await user.type(screen.getByRole('searchbox', { name: 'Search permissions' }), 'role');

    await waitFor(() => expect(summaries()).toEqual(['role4 permissions']));
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
      'Showing 1–4 of 4',
    );
  });

  it('moves to the new last page when a delete empties the current one', async () => {
    const { store } = mockApi(many(8, 3));
    server.use(
      deletePermissionHandler(({ params }) => {
        store.permissions = store.permissions.filter((p) => p.documentId !== params.id);
        return new HttpResponse(null, { status: 204 });
      }).handler,
    );
    const { user } = await renderAt('/?page=2');
    expect(summaries()).toEqual(['role3 permissions']);

    await user.click(screen.getByRole('button', { name: 'Delete role:r3' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete permission' }));

    expect(await screen.findByText('Permission "role:r3" deleted.')).toBeInTheDocument();
    await waitFor(() =>
      expect(summaries()).toEqual(['document8 permissions', 'role2 permissions']),
    );
  });
});

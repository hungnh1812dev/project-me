import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessToken } from '@/features/settings/types';
import {
  makeAccessToken,
  makeAccessTokenSecret,
  makeMeUser,
  makePermission,
  makeRole,
} from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createAccessTokenHandler,
  deleteAccessTokenHandler,
  listAccessTokensHandler,
  listPermissionsHandler,
  revokeAccessTokenHandler,
  settingsErrorReply,
} from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import AccessTokensPage from './AccessTokensPage';

const CI = makeAccessToken({
  documentId: 'tok-ci',
  name: 'CI deploy',
  permissions: ['document:read', 'document:read:article', 'role:read'],
  expiresAt: '2099-03-01T00:00:00.000Z',
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-06T00:00:00.000Z',
});
const PREVIEW = makeAccessToken({
  documentId: 'tok-preview',
  name: 'Preview',
  permissions: ['document:read'],
  expiresAt: null,
});
const OLD = makeAccessToken({
  documentId: 'tok-old',
  name: 'Old import',
  permissions: [],
  expiresAt: '2020-01-01T00:00:00.000Z',
});
const TOKENS = [CI, PREVIEW, OLD];

const CATALOG = [
  makePermission({ documentId: 'p1', slug: 'document:read', name: 'Read documents' }),
  makePermission({ documentId: 'p2', slug: 'role:read', name: 'Read roles' }),
];

const MANAGER = ['api_token:read', 'api_token:manager', 'permission:read'];
const NO_PERMISSIONS = "A token with no permissions can't call any protected endpoint.";

function auth(permissions: string[] = MANAGER) {
  return {
    status: 'authenticated' as const,
    user: makeMeUser({ role: makeRole({ permissions }) }),
  };
}

/** Installs T1 over a mutable list and P1 over the catalog. */
function mockApi(tokens: AccessToken[] = [...TOKENS]) {
  const store = { tokens };
  const t1 = listAccessTokensHandler(() => HttpResponse.json(store.tokens));
  server.use(t1.handler, listPermissionsHandler(() => HttpResponse.json(CATALOG)).handler);
  return { store, t1 };
}

async function renderPage(permissions = MANAGER) {
  const view = renderWithProviders(<AccessTokensPage />, { auth: auth(permissions) });
  await screen.findByRole('table', { name: 'Access tokens' });
  return view;
}

const rowOf = (name: string) =>
  screen
    .getAllByRole('row')
    .find((row) => within(row).queryAllByRole('cell')[0]?.textContent === name);

const namesInOrder = () =>
  within(screen.getByRole('table', { name: 'Access tokens' }))
    .getAllByRole('row')
    .slice(1)
    .filter((row) => !row.hasAttribute('data-details'))
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('AccessTokensPage list (AC-2, AC-28)', () => {
  it('renders the heading, a description and New token', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Access tokens' })).toBeInTheDocument();
    expect(screen.getByText(/issue api keys/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New token' })).toBeVisible();
  });

  it('shows name, permission count, expiry and the created and updated dates', async () => {
    mockApi();
    await renderPage();

    const cells = within(rowOf('CI deploy') as HTMLElement).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('3 permissions');
    expect(cells[2]).toHaveTextContent('Mar 1, 2099');
    expect(cells[3]).toHaveTextContent('Jan 5, 2026');
    expect(cells[4]).toHaveTextContent('Jan 6, 2026');
    within(screen.getByRole('table', { name: 'Access tokens' }))
      .getAllByRole('columnheader')
      .forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('shows "Never" for a token without expiry and an Expired badge once it has passed', async () => {
    mockApi();
    await renderPage();

    expect(within(rowOf('Preview') as HTMLElement).getAllByRole('cell')[2]).toHaveTextContent(
      'Never',
    );
    const expired = within(rowOf('Old import') as HTMLElement).getAllByRole('cell')[2];
    expect(expired).toHaveTextContent('Expired');
    expect(within(expired as HTMLElement).getByText('Expired')).toHaveAttribute(
      'data-slot',
      'badge',
    );
    expect(within(rowOf('CI deploy') as HTMLElement).queryByText('Expired')).toBeNull();
  });

  it('expands a row to its permissions grouped by resource, read-only', async () => {
    mockApi();
    const { user } = await renderPage();
    const toggle = screen.getByRole('button', { name: 'CI deploy: 3 permissions' });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('region', { name: 'CI deploy permissions' });
    expect(toggle).toHaveAttribute('aria-controls', details.id);
    expect(
      within(within(details).getByRole('list', { name: 'document' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['document:read', 'document:read:article']);
    expect(within(details).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says so when an expanded token has no permissions', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Old import: 0 permissions' }));

    expect(screen.getByText('This token grants no permissions.')).toBeInTheDocument();
  });

  it('never renders a secret the list response carries', async () => {
    server.use(
      listAccessTokensHandler(() => HttpResponse.json([{ ...CI, token: 'cms_leaked' }])).handler,
    );
    await renderPage();

    expect(document.body.innerHTML).not.toContain('cms_leaked');
  });
});

describe('AccessTokensPage search and states (AC-3, AC-4)', () => {
  it('filters by name, case-insensitively, without a request', async () => {
    const { t1 } = mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search access tokens' }), 'PREV');

    expect(namesInOrder()).toEqual(['Preview']);
    expect(screen.getByText('1 access token')).toBeInTheDocument();
    expect(t1.requests).toHaveLength(1);
  });

  it('shows the no-match state', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox'), 'nothing');

    expect(screen.getByText('No access tokens match "nothing".')).toBeInTheDocument();
  });

  it('shows the error with Retry, which refetches', async () => {
    const t1 = listAccessTokensHandler(settingsErrorReply(500, 'Server down'));
    server.use(t1.handler);
    const { user } = renderWithProviders(<AccessTokensPage />, { auth: auth() });

    // A 5xx is retried once (about a second) before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Server down',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(t1.requests.length).toBeGreaterThan(1));
  });

  it('shows "no access" without Retry on a server 403', async () => {
    server.use(listAccessTokensHandler(settingsErrorReply(403, 'Forbidden resource')).handler);
    renderWithProviders(<AccessTokensPage />, { auth: auth() });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to access tokens.",
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the empty state with the primary action', async () => {
    mockApi([]);
    renderWithProviders(<AccessTokensPage />, { auth: auth() });

    expect(await screen.findByText('No access tokens yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New token' })).toHaveLength(2);
  });
});

describe('AccessTokensPage gating (AC-5)', () => {
  it('disables every write control for a read-only actor, with the reason', async () => {
    mockApi();
    const { user } = await renderPage(['api_token:read']);
    const reason = 'Requires the "api_token:manager" permission.';

    for (const name of ['New token', 'Revoke CI deploy', 'Delete CI deploy']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(reason);
    }
    await user.click(screen.getByRole('button', { name: 'Revoke CI deploy' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('AccessTokensPage create (AC-8 to AC-10, AC-29, AC-30, AC-33)', () => {
  async function openCreate() {
    const view = await renderPage();
    await view.user.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = await screen.findByRole('dialog', { name: 'New token' });
    return { ...view, dialog };
  }

  it('opens a modal form with Name focused, Expires defaulting to 1 month and the tree', async () => {
    mockApi();
    const { dialog } = await openCreate();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus(),
    );
    expect(within(dialog).getByRole('combobox', { name: 'Expires' })).toHaveTextContent('1 month');
    expect(await within(dialog).findByRole('checkbox', { name: 'Select all' })).toBeVisible();
  });

  it('offers the six expiry options with their labels', async () => {
    mockApi();
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('combobox', { name: 'Expires' }));

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      '30 minutes',
      '1 hour',
      '1 day',
      '1 month',
      '1 year',
      'Never',
    ]);
  });

  it('warns about an empty permission set until a permission is picked', async () => {
    mockApi();
    const { user, dialog } = await openCreate();

    expect(within(dialog).getByText(NO_PERMISSIONS)).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('checkbox', { name: 'document' }));

    expect(within(dialog).queryByText(NO_PERMISSIONS)).not.toBeInTheDocument();
  });

  it('validates the name on submit, then on change, without a request', async () => {
    mockApi();
    const t2 = createAccessTokenHandler();
    server.use(t2.handler);
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'a'.repeat(101));
    expect(within(dialog).getByText('Use 100 characters or fewer.')).toBeInTheDocument();
    expect(t2.requests).toHaveLength(0);
  });

  it('sends T2, then shows the secret once, and clears it on Done', async () => {
    const { store, t1 } = mockApi();
    const t2 = createAccessTokenHandler(({ body }) => {
      const created = makeAccessTokenSecret({
        documentId: 'tok-new',
        ...(body as object),
        token: 'cms_secret_new',
      });
      const { token: _secret, ...record } = created;
      store.tokens = [...store.tokens, record];
      return HttpResponse.json(created, { status: 201 });
    });
    server.use(t2.handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Nightly ');
    await user.click(within(dialog).getByRole('combobox', { name: 'Expires' }));
    await user.click(await screen.findByRole('option', { name: '1 year' }));
    await user.click(await within(dialog).findByRole('checkbox', { name: 'role' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const reveal = await screen.findByRole('alertdialog', { name: 'Copy your token now' });
    expect(t2.requests[0]?.body).toEqual({
      name: 'Nightly',
      permissions: ['role:read'],
      expiresIn: '1y',
    });
    expect(within(reveal).getByRole('textbox', { name: 'Token' })).toHaveValue('cms_secret_new');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(reveal).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('cms_secret_new');
    expect(await screen.findByText('Token "Nightly" created.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Revoke Nightly' })).toBeVisible();
    expect(t1.requests.length).toBeGreaterThan(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New token' })).toHaveFocus());
  });

  it('copies the secret from the reveal', async () => {
    mockApi();
    server.use(createAccessTokenHandler().handler);
    const { user, dialog } = await openCreate();
    // After `userEvent.setup()`, which installs its own clipboard stub.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    const reveal = await screen.findByRole('alertdialog', { name: 'Copy your token now' });

    await user.click(within(reveal).getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('cms_secret_1');
    expect(within(reveal).getByRole('status')).toHaveTextContent('Copied.');
  });

  it('shows a 400 server message as an alert in the dialog', async () => {
    mockApi();
    server.use(createAccessTokenHandler(settingsErrorReply(400, 'Unknown permission')).handler);
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unknown permission');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the read-only permissions note without permission:read', async () => {
    mockApi();
    const { user } = await renderPage(['api_token:read', 'api_token:manager']);

    await user.click(screen.getByRole('button', { name: 'New token' }));
    const dialog = await screen.findByRole('dialog', { name: 'New token' });

    expect(within(dialog).queryByRole('checkbox', { name: 'Select all' })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/permission:read/)).toBeInTheDocument();
  });
});

describe('AccessTokensPage revoke (AC-7, AC-30, AC-31, AC-33)', () => {
  it('confirms naming the token, sends T3 with {}, then reveals the new secret', async () => {
    mockApi();
    const t3 = revokeAccessTokenHandler(({ params }) =>
      HttpResponse.json({ ...CI, documentId: params.id, token: 'cms_secret_rotated' }),
    );
    server.use(t3.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Revoke CI deploy' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke token "CI deploy"?' });
    expect(confirm).toHaveAccessibleDescription(
      'The current secret stops working immediately. A new secret will be shown once.',
    );
    await waitFor(() =>
      expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    await user.click(within(confirm).getByRole('button', { name: 'Revoke token' }));

    const reveal = await screen.findByRole('alertdialog', { name: 'Copy your token now' });
    expect(t3.requests[0]).toMatchObject({ body: {}, params: { id: 'tok-ci' } });
    expect(within(reveal).getByRole('textbox', { name: 'Token' })).toHaveValue(
      'cms_secret_rotated',
    );

    await user.click(within(reveal).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('cms_secret_rotated');
    expect(
      await screen.findByText('Token "CI deploy" revoked. Its new secret was shown once.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Revoke CI deploy' })).toHaveFocus(),
    );
  });

  it('keeps a 404 inside the confirm dialog', async () => {
    mockApi();
    server.use(revokeAccessTokenHandler(settingsErrorReply(404, 'Token not found')).handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Revoke CI deploy' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Revoke token' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Token not found');
    expect(
      screen.queryByRole('alertdialog', { name: 'Copy your token now' }),
    ).not.toBeInTheDocument();
  });
});

describe('AccessTokensPage delete (AC-7, AC-10, AC-32)', () => {
  it('confirms naming the token, sends T4, removes the row and announces', async () => {
    const { store } = mockApi();
    const t4 = deleteAccessTokenHandler(({ params }) => {
      store.tokens = store.tokens.filter((token) => token.documentId !== params.id);
      return new HttpResponse(null, { status: 204 });
    });
    server.use(t4.handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Preview' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete token "Preview"?' });
    const button = within(confirm).getByRole('button', { name: 'Delete token' });
    expect(button.className).toMatch(/bg-destructive/);
    await user.click(button);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(t4.requests[0]?.params.id).toBe('tok-preview');
    expect(await screen.findByText('Token "Preview" deleted.')).toBeInTheDocument();
    await waitFor(() => expect(rowOf('Preview')).toBeUndefined());
  });

  it('keeps a 404 inside the confirm dialog', async () => {
    mockApi();
    server.use(deleteAccessTokenHandler(settingsErrorReply(404, 'Token not found')).handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Preview' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete token' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Token not found');
  });
});

describe('AccessTokensPage paging (Phase 6 AC-21, AC-24 to AC-26)', () => {
  const manyTokens = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return makeAccessToken({ documentId: `tok-${n}`, name: `Token ${n}`, expiresAt: null });
    });

  async function renderAt(route: string) {
    const view = renderWithProviders(<AccessTokensPage />, { auth: auth(), route });
    await screen.findByRole('table', { name: 'Access tokens' });
    return view;
  }

  it('shows 10 tokens with the pagination under the table, and opens a deep link', async () => {
    mockApi(manyTokens(12));
    await renderAt('/?page=2');

    expect(namesInOrder()).toEqual(['Token 11', 'Token 12']);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
      'Showing 11–12 of 12',
    );
  });

  it('goes back to page 1 when the search changes', async () => {
    mockApi(manyTokens(12));
    const { user } = await renderAt('/?page=2');

    await user.type(screen.getByRole('searchbox', { name: 'Search access tokens' }), 'token');

    await waitFor(() => expect(namesInOrder()).toHaveLength(10));
  });

  it('moves to the new last page when a delete empties the current one', async () => {
    const { store } = mockApi(manyTokens(11));
    server.use(
      deleteAccessTokenHandler(({ params }) => {
        store.tokens = store.tokens.filter((token) => token.documentId !== params.id);
        return new HttpResponse(null, { status: 204 });
      }).handler,
    );
    const { user } = await renderAt('/?page=2');
    expect(namesInOrder()).toEqual(['Token 11']);

    await user.click(screen.getByRole('button', { name: 'Delete Token 11' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete token' }));

    expect(await screen.findByText('Token "Token 11" deleted.')).toBeInTheDocument();
    await waitFor(() => expect(namesInOrder()).toHaveLength(10));
  });
});

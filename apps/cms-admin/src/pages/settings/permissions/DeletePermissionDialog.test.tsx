import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { makeMeUser, makePermission, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { deletePermissionHandler, settingsErrorReply } from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import { DeletePermissionDialog } from './DeletePermissionDialog';

const PERMISSION = makePermission({ documentId: 'perm-x', slug: 'article:export' });
const ALL = ['permission:manager', 'role:read', 'api_token:read'];

function setup(permissions: string[] = ALL) {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  const view = renderWithProviders(
    <DeletePermissionDialog
      permission={PERMISSION}
      open
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
    />,
    {
      auth: {
        status: 'authenticated',
        user: makeMeUser({ role: makeRole({ permissions }) }),
      },
    },
  );
  return { ...view, onOpenChange, onDeleted };
}

const conflictReply = (roleCount: unknown, accessTokenCount: unknown) => () =>
  HttpResponse.json(
    { statusCode: 409, message: 'Permission is in use', roleCount, accessTokenCount },
    { status: 409 },
  );

describe('DeletePermissionDialog (AC-7, AC-27)', () => {
  it('confirms naming the slug, with Cancel focused and a destructive verb', async () => {
    setup();

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete article:export?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    expect(within(dialog).getByRole('button', { name: 'Delete permission' }).className).toMatch(
      /bg-destructive/,
    );
  });

  it('sends P4, then closes and announces', async () => {
    const p4 = deletePermissionHandler();
    server.use(p4.handler);
    const { user, onOpenChange, onDeleted } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(p4.requests[0]?.params.id).toBe('perm-x');
    expect(onDeleted).toHaveBeenCalledWith('Permission "article:export" deleted.');
  });

  it('switches to the conflict state on a 409: counts, links and only Close', async () => {
    server.use(deletePermissionHandler(conflictReply(2, 1)).handler);
    const { user, onDeleted } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'article:export is still in use',
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'This permission is still used by 2 roles and 1 access token. Remove it from them first.',
    );
    expect(within(dialog).getByRole('link', { name: 'Roles' })).toHaveAttribute(
      'href',
      '/admin/settings/roles',
    );
    expect(within(dialog).getByRole('link', { name: 'Access tokens' })).toHaveAttribute(
      'href',
      '/admin/settings/access-tokens',
    );
    expect(within(dialog).queryByRole('button', { name: 'Delete permission' })).toBeNull();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus(),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('leaves out a zero count and the links the actor cannot read', async () => {
    server.use(deletePermissionHandler(conflictReply(3, 0)).handler);
    const { user } = setup(['permission:manager', 'role:read']);

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This permission is still used by 3 roles. Remove it');
    expect(screen.getByRole('link', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Access tokens' })).toBeNull();
  });

  it('shows no links without role:read or api_token:read', async () => {
    server.use(deletePermissionHandler(conflictReply(1, 1)).handler);
    const { user } = setup(['permission:manager']);

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    await screen.findByRole('alert');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('falls back to the server message when the counts are missing', async () => {
    server.use(deletePermissionHandler(settingsErrorReply(409, 'Still referenced.')).handler);
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Still referenced.');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('closes from a link, so the next page is not covered', async () => {
    server.use(deletePermissionHandler(conflictReply(1, 0)).handler);
    const { user, onOpenChange } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));
    await user.click(await screen.findByRole('link', { name: 'Roles' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows another server error and keeps the confirm button', async () => {
    server.use(deletePermissionHandler(settingsErrorReply(404, 'Permission not found')).handler);
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete permission' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission not found');
    expect(screen.getByRole('button', { name: 'Delete permission' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: 'Delete article:export?' })).toBeInTheDocument();
  });
});

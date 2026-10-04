import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { settingsKeys } from '@/features/settings/queryKeys';
import { makeMeUser, makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { deleteRoleHandler, settingsErrorReply } from '@/test/msw/settingsHandlers';
import { renderWithProviders } from '@/test/renderWithProviders';

import { DeleteRoleDialog } from './DeleteRoleDialog';

const WRITER = makeRole({ documentId: 'role-writer', name: 'Writer', slug: 'writer' });
const AUTH = {
  status: 'authenticated' as const,
  user: makeMeUser({ role: makeRole({ permissions: ['role:read', 'role:manager'] }) }),
};

function setup(role = WRITER) {
  const onDeleted = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <DeleteRoleDialog role={role} open onOpenChange={onOpenChange} onDeleted={onDeleted} />,
    { auth: AUTH },
  );
  return { ...view, onDeleted, onOpenChange };
}

describe('DeleteRoleDialog (AC-7, AC-21)', () => {
  it('names the role, focuses Cancel and uses a destructive "Delete role"', async () => {
    setup();

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete role "Writer"?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    expect(within(dialog).getByRole('button', { name: 'Delete role' }).className).toMatch(
      /bg-destructive/,
    );
  });

  it('sends R4, announces and closes', async () => {
    const r4 = deleteRoleHandler();
    server.use(r4.handler);
    const { user, onDeleted, onOpenChange } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete role' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(r4.requests[0]?.params.id).toBe('role-writer');
    expect(onDeleted).toHaveBeenCalledWith('Role "Writer" deleted.');
  });

  it('on a 409, explains the role is in use with the cached user count, and offers only Close', async () => {
    server.use(deleteRoleHandler(settingsErrorReply(409, 'Role in use')).handler);
    const { user, queryClient } = setup();
    queryClient.setQueryData(settingsKeys.users(), [
      makeUser({ documentId: 'u1', roleId: 'role-writer' }),
      makeUser({ documentId: 'u2', roleId: 'role-writer' }),
      makeUser({ documentId: 'u3', roleId: 'role-other' }),
    ]);

    await user.click(await screen.findByRole('button', { name: 'Delete role' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This role is still assigned to users. Assign them another role first.',
    );
    expect(alert).toHaveTextContent('2 users');
    expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
  });

  it('on a 409 without cached users, leaves the count out', async () => {
    server.use(deleteRoleHandler(settingsErrorReply(409, 'Role in use')).handler);
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete role' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^This role is still assigned to users\. Assign them another role first\.$/,
    );
  });

  it('uses the singular for one cached user', async () => {
    server.use(deleteRoleHandler(settingsErrorReply(409, 'Role in use')).handler);
    const { user, queryClient } = setup();
    queryClient.setQueryData(settingsKeys.users(), [makeUser({ roleId: 'role-writer' })]);

    await user.click(await screen.findByRole('button', { name: 'Delete role' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Assigned to 1 user.');
  });

  it('shows any other server error and keeps Delete', async () => {
    server.use(
      deleteRoleHandler(settingsErrorReply(400, 'A default role cannot be deleted')).handler,
    );
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Delete role' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A default role cannot be deleted');
    expect(screen.getByRole('button', { name: 'Delete role' })).toBeVisible();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildColumnCatalog } from '@/features/content/columns';
import { contentKeys } from '@/features/content/queryKeys';
import type { ContentType } from '@/features/content/types';
import { makeContentType } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { errorReply, patchListFieldsHandler } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

import { ColumnChooserDialog } from './ColumnChooserDialog';

const TYPE = makeContentType({ listFields: ['title', 'updatedAt'] });
const MANAGER = ['content_type:read', 'content_type:manager', 'document:read'];

function renderDialog(type: ContentType = TYPE, permissions = MANAGER) {
  const onOpenChange = vi.fn();
  const utils = renderWithProviders(
    <ColumnChooserDialog
      type={type}
      catalog={buildColumnCatalog(type)}
      open
      onOpenChange={onOpenChange}
    />,
    { auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) } },
  );
  return { onOpenChange, ...utils };
}

const rowNames = () =>
  within(screen.getByRole('list', { name: 'Columns' }))
    .getAllByRole('checkbox')
    .map(
      (box) =>
        box.getAttribute('aria-label') ?? (box as HTMLInputElement).labels?.[0]?.textContent ?? '',
    );

describe('ColumnChooserDialog (AC-25)', () => {
  it('lists the chosen columns first, in order, then the other listable columns', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Choose columns' });
    expect(dialog).toHaveAccessibleDescription(/applies to everyone/);
    expect(rowNames()).toEqual([
      'Title',
      'Updated',
      'ID',
      'Document ID',
      'Status',
      'Created',
      'Published',
      'Updated by',
      'Views',
      'Featured',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Title' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Updated' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Views' })).not.toBeChecked();
  });

  it('disables Move up on the first row and Move down on the last', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Move Title up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Featured down' })).toBeDisabled();
  });

  it('saves the checked columns in their new order through C3, then closes', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { onOpenChange, queryClient, user } = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: 'Views' }));
    await user.click(screen.getByRole('button', { name: 'Move Updated up' }));
    await user.click(screen.getByRole('button', { name: 'Save columns' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(c3.requests).toHaveLength(1);
    expect(c3.requests[0]!.body).toEqual({ listFields: ['updatedAt', 'title', 'views'] });
    expect(queryClient.getQueryData<ContentType>(contentKeys.type('article'))?.listFields).toEqual([
      'updatedAt',
      'title',
      'views',
    ]);
  });

  it('blocks Save with no column chosen and sends nothing', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { onOpenChange, user } = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: 'Title' }));
    await user.click(screen.getByRole('checkbox', { name: 'Updated' }));
    await user.click(screen.getByRole('button', { name: 'Save columns' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose at least one column.');
    expect(c3.requests).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'listFields contains an unknown field', 'listFields contains an unknown field'],
    [403, 'Forbidden resource', "You don't have access to do this."],
  ])('keeps a server %i inside the dialog', async (status, message, shown) => {
    server.use(patchListFieldsHandler(errorReply(status, message)).handler);
    const { onOpenChange, user } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save columns' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.getByRole('dialog', { name: 'Choose columns' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ContentType, DocumentStatus } from '@/features/content/types';
import { makeContentType, makeListedItem } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  deleteDocumentHandler,
  duplicateDocumentHandler,
  errorReply,
  publishDocumentHandler,
  unpublishDocumentHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import { RowActions } from './RowActions';

const ALL = [
  'content_type:read',
  'document:read',
  'document:create',
  'document:delete',
  'document:publish',
  'document:unpublish',
];

const ARTICLE = makeContentType();

function renderMenu({
  status = 'draft',
  permissions = ALL,
  type = ARTICLE,
  focusAfterDelete,
}: {
  status?: DocumentStatus;
  permissions?: string[];
  type?: ContentType;
  focusAfterDelete?: () => HTMLElement | null;
} = {}) {
  const onResult = vi.fn();
  const item = makeListedItem({ documentId: 'doc-1', status, data: { title: 'Hello world' } });
  const utils = renderRoutes(
    [
      {
        path: '/admin/content-types/article',
        element: (
          <>
            <RowActions
              type={type}
              item={item}
              label="Hello world"
              onResult={onResult}
              focusAfterDelete={focusAfterDelete}
            />
            <button type="button">Fallback</button>
          </>
        ),
      },
      { path: '/admin/content-types/article/:documentId', element: <h1>Detail</h1> },
    ],
    {
      route: '/admin/content-types/article',
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
  return { ...utils, onResult };
}

async function openMenu(user: ReturnType<typeof renderMenu>['user']) {
  await user.click(screen.getByRole('button', { name: 'Actions for Hello world' }));
  return screen.findByRole('menu');
}

describe('RowActions (AC-28, AC-29)', () => {
  it('Edit links to the entry', async () => {
    const { user } = renderMenu();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }));

    expect(await screen.findByRole('heading', { name: 'Detail' })).toBeInTheDocument();
  });

  it('duplicates with D8 and announces the copy', async () => {
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { user, onResult } = renderMenu();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('Copy of "Hello world" created.'));
    expect(d8.requests[0]!.params.documentId).toBe('doc-1');
  });

  it.each<[DocumentStatus, string[], string[]]>([
    ['draft', ['Publish'], ['Unpublish']],
    ['modified', ['Publish', 'Unpublish'], []],
    ['published', ['Unpublish'], ['Publish']],
  ])('a %s entry offers %j and not %j', async (status, shown, hidden) => {
    const { user } = renderMenu({ status });

    const menu = await openMenu(user);

    for (const name of shown) expect(within(menu).getByRole('menuitem', { name })).toBeVisible();
    for (const name of hidden)
      expect(within(menu).queryByRole('menuitem', { name })).not.toBeInTheDocument();
  });

  it('publishes with D6 and announces it', async () => {
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { user, onResult } = renderMenu({ status: 'draft' });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Publish' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('"Hello world" published.'));
    expect(d6.requests).toHaveLength(1);
  });

  it('unpublishes with D7 and announces it', async () => {
    const d7 = unpublishDocumentHandler();
    server.use(d7.handler);
    const { user, onResult } = renderMenu({ status: 'published' });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Unpublish' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('"Hello world" unpublished.'));
    expect(d7.requests).toHaveLength(1);
  });

  it('offers no publish item without draft and publish', async () => {
    const { user } = renderMenu({ type: makeContentType({ draftToPublish: false }) });

    const menu = await openMenu(user);

    expect(within(menu).queryByRole('menuitem', { name: 'Publish' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Unpublish' })).not.toBeInTheDocument();
  });

  it('confirms the delete naming the entry, then sends D5 and announces it', async () => {
    const d5 = deleteDocumentHandler();
    server.use(d5.handler);
    const { user, onResult } = renderMenu();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Hello world"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('"Hello world" deleted.'));
    expect(d5.requests).toHaveLength(1);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it('moves focus to focusAfterDelete after a confirmed delete, as the row is going away', async () => {
    server.use(deleteDocumentHandler().handler);
    // The modal still hides the page from the accessibility tree while it closes.
    const fallback = () => screen.getByRole('button', { name: 'Fallback', hidden: true });
    const { user } = renderMenu({ focusAfterDelete: fallback });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Hello world"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(fallback()).toHaveFocus());
  });

  it('returns focus to the Actions button when the delete is cancelled', async () => {
    const focusAfterDelete = vi.fn(() => null);
    const { user } = renderMenu({ focusAfterDelete });

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Hello world"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Hello world' })).toHaveFocus(),
    );
    expect(focusAfterDelete).not.toHaveBeenCalled();
  });

  it('reports "no access" when the server forbids an action (AC-33)', async () => {
    server.use(publishDocumentHandler(errorReply(403, 'Forbidden resource')).handler);
    const { user, onResult } = renderMenu();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Publish' }));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith("You don't have access to do this.", true),
    );
  });
});

describe('RowActions gating (AC-32)', () => {
  it.each([
    ['Duplicate', 'document:create', duplicateDocumentHandler],
    ['Publish', 'document:publish', publishDocumentHandler],
    ['Delete', 'document:delete', deleteDocumentHandler],
  ] as const)(
    'keeps %s in the menu, aria-disabled with the reason, and sends nothing without %s',
    async (name, missing, makeHandler) => {
      const recorder = makeHandler();
      server.use(recorder.handler);
      const { user, onResult } = renderMenu({
        permissions: ALL.filter((permission) => permission !== missing),
      });

      const menu = await openMenu(user);
      const item = within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription(/.+/);
      await user.click(item);

      expect(recorder.requests).toHaveLength(0);
      expect(onResult).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
  );

  it('gates an action scoped to another content type', async () => {
    const { user } = renderMenu({
      permissions: ['content_type:read', 'document:read', 'document:create:other'],
    });

    const menu = await openMenu(user);

    expect(within(menu).getByRole('menuitem', { name: /^Duplicate/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

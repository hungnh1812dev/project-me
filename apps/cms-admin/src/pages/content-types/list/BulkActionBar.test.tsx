import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { DocumentStatus, ListedDocumentItem } from '@/features/content/types';
import { makeContentType, makeListedItem, makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  bulkDeleteDocumentsHandler,
  errorReply,
  listDocumentsHandler,
  publishDocumentHandler,
  unpublishDocumentHandler,
  type RecordedRequest,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import CollectionListPage from '../CollectionListPage';

const TYPE = makeContentType({ listFields: ['title'] });
const MODE_B = makeContentType({ listFields: ['title'], draftToPublish: false });
const ALL = [
  'content_type:read',
  'document:read',
  'document:create',
  'document:delete',
  'document:publish',
  'document:unpublish',
];

/** An in-memory list: D1 reads it, so deleted or published rows show after the refetch. */
function backend(statuses: DocumentStatus[]) {
  let rows: ListedDocumentItem[] = statuses.map((status, i) =>
    makeListedItem({
      id: i + 1,
      documentId: `doc-${i + 1}`,
      status,
      data: { title: `Post ${i + 1}` },
    }),
  );
  const d1 = listDocumentsHandler(() =>
    HttpResponse.json(makeListResponse({ items: rows, total: rows.length, start: 0, size: 20 })),
  );
  server.use(d1.handler);
  return {
    remove: (ids: readonly string[]) => {
      rows = rows.filter((row) => !ids.includes(row.documentId));
    },
    setStatus: (id: string, status: DocumentStatus) => {
      rows = rows.map((row) => (row.documentId === id ? { ...row, status } : row));
    },
  };
}

function renderPage({ type = TYPE, permissions = ALL } = {}) {
  return renderRoutes(
    [{ path: '/admin/content-types/:slug', element: <CollectionListPage type={type} /> }],
    {
      route: '/admin/content-types/article',
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
}

const box = (n: number) => screen.getByRole('checkbox', { name: `Select Post ${n}` });

async function select(user: ReturnType<typeof renderPage>['user'], ...rows: number[]) {
  await screen.findByRole('table');
  for (const n of rows) await user.click(box(n));
}

const bar = () => screen.getByRole('region', { name: 'Bulk actions' });

describe('BulkActionBar selection', () => {
  it('appears with the count once a row is selected, and Clear selection empties it', async () => {
    backend(['draft', 'draft', 'draft']);
    const { user } = renderPage();
    await screen.findByRole('table');

    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    await select(user, 1, 3);
    expect(within(bar()).getByText('2 selected')).toBeInTheDocument();

    await user.click(within(bar()).getByRole('button', { name: 'Clear selection' }));

    expect(box(1)).not.toBeChecked();
    expect(box(3)).not.toBeChecked();
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });
});

describe('BulkActionBar delete (AC-30)', () => {
  it('confirms, sends D10, summarises a partial result and keeps only the failed row selected', async () => {
    const list = backend(['draft', 'draft', 'draft']);
    const d10 = bulkDeleteDocumentsHandler(() => {
      list.remove(['doc-1', 'doc-3']);
      return HttpResponse.json({
        deleted: ['doc-1', 'doc-3'],
        failed: [{ documentId: 'doc-2', error: 'Entry is locked.' }],
      });
    });
    server.use(d10.handler);
    const { user } = renderPage();
    await select(user, 1, 2, 3);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 3 entries?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entries' }));

    expect(await screen.findByText('2 of 3 entries deleted.')).toBeInTheDocument();
    expect(d10.requests).toHaveLength(1);
    expect(d10.requests[0]!.body).toEqual({ documentIds: ['doc-1', 'doc-2', 'doc-3'] });
    expect(screen.getByText('Post 2: Entry is locked.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Select Post 1' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('checkbox', { name: 'Select Post 3' })).not.toBeInTheDocument();
    expect(box(2)).toBeChecked();
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('moves focus to the entries region when every selected row was deleted', async () => {
    const list = backend(['draft', 'draft', 'draft']);
    server.use(
      bulkDeleteDocumentsHandler(() => {
        list.remove(['doc-1', 'doc-2']);
        return HttpResponse.json({ deleted: ['doc-1', 'doc-2'], failed: [] });
      }).handler,
    );
    const { user } = renderPage();
    await select(user, 1, 2);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 entries?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entries' }));

    await waitFor(() => expect(screen.queryAllByRole('row')).toHaveLength(2));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Article entries' })).toHaveFocus(),
    );
  });

  it('moves focus to the list heading when the delete emptied the list', async () => {
    const list = backend(['draft', 'draft']);
    server.use(
      bulkDeleteDocumentsHandler(() => {
        list.remove(['doc-1', 'doc-2']);
        return HttpResponse.json({ deleted: ['doc-1', 'doc-2'], failed: [] });
      }).handler,
    );
    const { user } = renderPage();
    await select(user, 1, 2);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 entries?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entries' }));

    expect(await screen.findByText('No entries yet.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: TYPE.name })).toHaveFocus(),
    );
  });

  it('keeps focus on Delete selected when a failed row stays selected', async () => {
    const list = backend(['draft', 'draft']);
    server.use(
      bulkDeleteDocumentsHandler(() => {
        list.remove(['doc-1']);
        return HttpResponse.json({
          deleted: ['doc-1'],
          failed: [{ documentId: 'doc-2', error: 'Entry is locked.' }],
        });
      }).handler,
    );
    const { user } = renderPage();
    await select(user, 1, 2);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 entries?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entries' }));

    expect(await screen.findByText('Post 2: Entry is locked.')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(bar()).getByRole('button', { name: 'Delete selected' })).toHaveFocus(),
    );
  });

  it('names a single entry in the title', async () => {
    backend(['draft']);
    const { user } = renderPage();
    await select(user, 1);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));

    expect(await screen.findByRole('alertdialog', { name: 'Delete 1 entry?' })).toBeInTheDocument();
  });

  it('keeps a server 403 inside the dialog and the selection as it was (AC-33)', async () => {
    backend(['draft', 'draft']);
    const d10 = bulkDeleteDocumentsHandler(errorReply(403, 'Forbidden resource'));
    server.use(d10.handler);
    const { user } = renderPage();
    await select(user, 1, 2);

    await user.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete entries' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You don't have access to do this.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(box(1)).toBeChecked();
    expect(box(2)).toBeChecked();
  });

  it('gates Delete selected without the delete permission: no dialog, no request', async () => {
    backend(['draft']);
    const d10 = bulkDeleteDocumentsHandler();
    server.use(d10.handler);
    const { user } = renderPage({ permissions: ALL.filter((p) => p !== 'document:delete') });
    await select(user, 1);

    const button = within(bar()).getByRole('button', { name: 'Delete selected' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(/document:delete/);
    await user.click(button);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(d10.requests).toHaveLength(0);
  });
});

describe('BulkActionBar publish and unpublish (AC-31)', () => {
  it('publishes one at a time, skips published rows, shows progress, then a summary with failures', async () => {
    const list = backend(['draft', 'published', 'modified', 'draft']);
    let release: (() => void) | undefined;
    const d6 = publishDocumentHandler(async (request: RecordedRequest) => {
      const id = request.params.documentId!;
      if (id === 'doc-1') await new Promise<void>((resolve) => (release = resolve));
      if (id === 'doc-3') return errorReply(403, 'Forbidden resource')(request);
      list.setStatus(id, 'published');
      return HttpResponse.json({ status: 'published' });
    });
    server.use(d6.handler);
    const { user } = renderPage();
    await select(user, 1, 2, 3, 4);

    await user.click(within(bar()).getByRole('button', { name: 'Publish selected' }));

    expect(await screen.findByText('Publishing 1 of 3…')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Delete selected' })).toBeDisabled();
    release!();

    expect(
      await screen.findByText('2 of 3 entries published. 1 skipped: already published.'),
    ).toBeInTheDocument();
    expect(screen.getByText("Post 3: You don't have access to do this.")).toBeInTheDocument();
    expect(d6.requests.map((r) => r.params.documentId)).toEqual(['doc-1', 'doc-3', 'doc-4']);
    expect(within(bar()).getByText('4 selected')).toBeInTheDocument();
  });

  it('unpublishes the selected rows that are not drafts', async () => {
    backend(['draft', 'published']);
    const d7 = unpublishDocumentHandler();
    server.use(d7.handler);
    const { user } = renderPage();
    await select(user, 1, 2);

    await user.click(within(bar()).getByRole('button', { name: 'Unpublish selected' }));

    // A clean summary shows below the bar and is announced through the page's live region.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '1 entry unpublished. 1 skipped: already unpublished.',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    expect(d7.requests.map((r) => r.params.documentId)).toEqual(['doc-2']);
  });

  it('gates Publish selected without the publish permission: no request', async () => {
    backend(['draft']);
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { user } = renderPage({ permissions: ALL.filter((p) => p !== 'document:publish') });
    await select(user, 1);

    const button = within(bar()).getByRole('button', { name: 'Publish selected' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(/document:publish/);
    await user.click(button);

    expect(d6.requests).toHaveLength(0);
    expect(screen.queryByText(/Publishing/)).not.toBeInTheDocument();
  });

  it('hides both buttons when the type has no draft and publish', async () => {
    backend(['draft']);
    const { user } = renderPage({ type: MODE_B });
    await select(user, 1);

    expect(within(bar()).getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
    expect(
      within(bar()).queryByRole('button', { name: 'Publish selected' }),
    ).not.toBeInTheDocument();
    expect(
      within(bar()).queryByRole('button', { name: 'Unpublish selected' }),
    ).not.toBeInTheDocument();
  });
});

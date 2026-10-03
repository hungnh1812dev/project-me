import { act, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Document } from '@/features/content/types';
import { makeContentType, makeDocument } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  deleteDocumentHandler,
  duplicateDocumentHandler,
  errorReply,
  getContentTypeHandler,
  getDocumentHandler,
  publishDocumentHandler,
  unpublishDocumentHandler,
  updateDocumentHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import DocumentDetailPage from './DocumentDetailPage';

const ALL = [
  'content_type:read',
  'document:read',
  'document:create',
  'document:update',
  'document:delete',
  'document:publish',
  'document:unpublish',
];

const ARTICLE = makeContentType({
  fields: [
    { name: 'title', type: 'text', header: true },
    { name: 'views', type: 'number' },
  ],
});

const entry = (overrides: Partial<Document> = {}) =>
  makeDocument({ documentId: 'doc-1', title: 'Hello world', views: 3, ...overrides });

/** The list page, showing the announcement it was sent with. */
const ListStub: React.FC = () => {
  const state = useLocation().state as { announce?: string } | null;
  return (
    <div>
      <h1>List</h1>
      {state?.announce && <p>{state.announce}</p>}
    </div>
  );
};

function renderPage({
  permissions = ALL,
  route = '/admin/content-types/article/doc-1',
}: { permissions?: string[]; route?: string } = {}) {
  return renderRoutes(
    [
      { path: '/admin/content-types/:slug/:documentId', element: <DocumentDetailPage /> },
      { path: '/admin/content-types/:slug', element: <ListStub /> },
    ],
    {
      route,
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
}

/** Installs C2 (ARTICLE) and D3 (`doc`, or the given reply). */
function load(doc: Document = entry()) {
  const d3 = getDocumentHandler(({ params }) =>
    HttpResponse.json({ data: { ...doc, documentId: params.documentId } }),
  );
  server.use(getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler, d3.handler);
  return d3;
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('DocumentDetailPage loading (AC-27)', () => {
  it('loads the entry into the form, with its label, status and audit line', async () => {
    load(entry({ status: 'published' }));

    renderPage();

    const h1 = await heading('Hello world');
    const header = h1.closest('header')!;
    expect(within(header).getByText('Published')).toHaveAttribute('data-slot', 'badge');
    expect(header).toHaveTextContent(/Updated .+ by Jane Doe/);
    expect(screen.getByLabelText('Title')).toHaveValue('Hello world');
    expect(screen.getByLabelText('Views')).toHaveValue('3');
  });

  it('shows "Untitled entry" when the label field is empty', async () => {
    load(entry({ title: '' }));

    renderPage();

    expect(await heading('Untitled entry')).toBeInTheDocument();
  });

  it('shows the 404 state with a link to the list', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler,
      getDocumentHandler(errorReply(404, 'Document not found')).handler,
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This entry doesn't exist or was deleted.",
    );
    expect(screen.getByRole('link', { name: 'Back to Article' })).toHaveAttribute(
      'href',
      '/admin/content-types/article',
    );
  });

  it('shows the no-access state on a 403', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler,
      getDocumentHandler(errorReply(403, 'Forbidden resource')).handler,
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to this entry.",
    );
  });

  it('shows the no-access state without a request when read is denied', async () => {
    const d3 = load();

    renderPage({ permissions: ['content_type:read', 'document:read:other'] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to this entry.",
    );
    expect(d3.requests).toHaveLength(0);
  });

  it('shows a generic alert when the entry fails otherwise', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler,
      getDocumentHandler(errorReply(400, 'Bad id')).handler,
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this entry.");
  });

  it('shows "Content type not found." with a link to the overview', async () => {
    server.use(getContentTypeHandler(errorReply(404, 'Not found')).handler);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Content type not found.');
    expect(screen.getByRole('link', { name: 'Back to content types' })).toBeInTheDocument();
  });

  it('shows a status while the entry loads', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler,
      getDocumentHandler(() => new Promise<Response>(() => {})).handler,
    );

    renderPage();

    expect(await screen.findByText('Loading entry…')).toHaveAttribute('role', 'status');
  });

  it('announces the message it was opened with', async () => {
    load();
    const { router } = renderPage();
    await heading('Hello world');

    await act(() =>
      router.navigate('/admin/content-types/article/doc-2', {
        state: { announce: 'Entry created.' },
      }),
    );

    expect(await screen.findByText('Entry created.')).toBeInTheDocument();
  });
});

describe('DocumentDetailPage save (AC-27)', () => {
  it('sends D4 with schema fields only and shows the returned status', async () => {
    load(entry({ status: 'published' }));
    const d4 = updateDocumentHandler();
    server.use(d4.handler);
    const { user } = renderPage();

    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Hello again');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(d4.requests).toHaveLength(1));
    expect(d4.requests[0]!.body).toEqual({ data: { title: 'Hello again', views: 3 } });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(await heading('Hello again')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows "no access" in the form on a server 403 and keeps the values (AC-33)', async () => {
    load();
    server.use(updateDocumentHandler(errorReply(403, 'Forbidden resource')).handler);
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("You don't have access to do this.")).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Hello world!');
  });

  it('is read-only with the reason when update is denied', async () => {
    load();
    const d4 = updateDocumentHandler();
    server.use(d4.handler);

    renderPage({ permissions: ['content_type:read', 'document:read'] });

    expect(await screen.findByRole('note')).toHaveTextContent('Read only');
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('asks before leaving a dirty form', async () => {
    load();
    const { user, router } = renderPage();
    await user.type(await screen.findByLabelText('Title'), '!');

    await act(() => router.navigate('/admin/content-types/article'));

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument();
  });
});

describe('DocumentDetailPage publish (AC-27)', () => {
  it('publishes a draft with D6 and announces it', async () => {
    load(entry({ status: 'draft' }));
    const d6 = publishDocumentHandler();
    server.use(d6.handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Published.')).toBeInTheDocument();
    expect(d6.requests[0]!.params.documentId).toBe('doc-1');
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
  });

  it('unpublishes a published entry with D7 and announces it', async () => {
    load(entry({ status: 'published' }));
    const d7 = unpublishDocumentHandler();
    server.use(d7.handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unpublish' }));

    expect(await screen.findByText('Unpublished.')).toBeInTheDocument();
    expect(d7.requests).toHaveLength(1);
  });

  it('waits for a clean form before publishing', async () => {
    load(entry({ status: 'draft' }));
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Title'), '!');

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAccessibleDescription('Save your changes first.');
  });

  it('shows "no access" where a publish was started on a server 403 (AC-33)', async () => {
    load(entry({ status: 'draft' }));
    server.use(publishDocumentHandler(errorReply(403, 'Forbidden resource')).handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to do this.");
  });

  it('shows no publish control and no badge without draft and publish', async () => {
    server.use(
      getContentTypeHandler(() =>
        HttpResponse.json(makeContentType({ ...ARTICLE, draftToPublish: false })),
      ).handler,
      getDocumentHandler(() => HttpResponse.json({ data: entry() })).handler,
    );

    renderPage();

    await heading('Hello world');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
  });
});

describe('DocumentDetailPage duplicate and delete (AC-28)', () => {
  it('duplicates with D8, opens the copy and announces it', async () => {
    load();
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { user, router } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Duplicate' }));

    expect(await screen.findByText('Copy created.')).toBeInTheDocument();
    expect(d8.requests[0]!.params.documentId).toBe('doc-1');
    expect(router.state.location.pathname).toBe('/admin/content-types/article/doc-1-copy');
  });

  it('gates Duplicate with the create reason, and sends nothing', async () => {
    load();
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { user } = renderPage({ permissions: ALL.filter((p) => p !== 'document:create') });

    const duplicate = await screen.findByRole('button', { name: 'Duplicate' });
    expect(duplicate).toHaveAttribute('aria-disabled', 'true');
    await user.click(duplicate);
    expect(d8.requests).toHaveLength(0);
  });

  it('confirms the delete naming the entry, sends D5 and goes to the list', async () => {
    load();
    const d5 = deleteDocumentHandler();
    server.use(d5.handler);
    const { user, router } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "Hello world"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));

    expect(await screen.findByRole('heading', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByText('Entry deleted.')).toBeInTheDocument();
    expect(d5.requests).toHaveLength(1);
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('deletes a dirty entry without asking about unsaved changes', async () => {
    load();
    server.use(deleteDocumentHandler().handler);
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete entry' }));

    expect(await screen.findByRole('heading', { name: 'List' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with "no access" on a server 403 (AC-33)', async () => {
    load();
    server.use(deleteDocumentHandler(errorReply(403, 'Forbidden resource')).handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You don't have access to do this.",
    );
    expect(dialog).toBeInTheDocument();
  });

  it('offers the secondary actions in a "More actions" menu', async () => {
    load(entry({ status: 'published' }));
    const d8 = duplicateDocumentHandler();
    server.use(d8.handler);
    const { user } = renderPage({ permissions: ALL.filter((p) => p !== 'document:delete') });

    await user.click(await screen.findByRole('button', { name: 'More actions' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Unpublish' })).toBeInTheDocument();
    const remove = within(menu).getByRole('menuitem', { name: /Delete/ });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(/delete/i);
    await user.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByText('Copy created.')).toBeInTheDocument();
  });
});

import { act, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { makeContentType } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  createDocumentHandler,
  errorReply,
  getContentTypeHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import DocumentCreatePage from './DocumentCreatePage';

const ARTICLE = makeContentType({
  fields: [
    { name: 'title', type: 'text', header: true },
    { name: 'views', type: 'number' },
    { name: 'featured', type: 'boolean' },
  ],
});

/** Shows where the router went and the state it carried. */
const Landing: React.FC<{ name: string }> = ({ name }) => {
  const location = useLocation();
  const state = location.state as { announce?: string; reason?: string } | null;
  return (
    <div>
      <h1>{name}</h1>
      <p>{location.pathname}</p>
      {state?.announce && <p>{state.announce}</p>}
      {state?.reason && <p>{state.reason}</p>}
    </div>
  );
};

function renderPage(permissions = ['content_type:read', 'document:read', 'document:create']) {
  return renderRoutes(
    [
      { path: '/admin/content-types/:slug/new', element: <DocumentCreatePage /> },
      { path: '/admin/content-types/:slug/:documentId', element: <Landing name="Detail" /> },
      { path: '/admin/content-types/:slug', element: <Landing name="List" /> },
      { path: '/admin/content-types', element: <Landing name="Overview" /> },
      { path: '/403', element: <Landing name="Forbidden" /> },
    ],
    {
      route: '/admin/content-types/article/new',
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
}

describe('DocumentCreatePage (AC-26)', () => {
  it('starts from empty values', async () => {
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler);

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'New entry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Views')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Featured' })).not.toBeChecked();
  });

  it('sends D2 with schema fields only, then replaces the URL with the new entry', async () => {
    const d2 = createDocumentHandler();
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler, d2.handler);
    const { user, router } = renderPage();

    await user.type(await screen.findByLabelText('Title'), 'First post');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Detail' })).toBeInTheDocument();
    expect(d2.requests[0]!.body).toEqual({
      data: { title: 'First post', views: null, featured: false },
    });
    expect(screen.getByText('/admin/content-types/article/doc-new')).toBeInTheDocument();
    expect(screen.getByText('Entry created.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // `replace`: the empty form is no longer in the history.
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('shows a 400 in the form and keeps the values', async () => {
    server.use(
      getContentTypeHandler(() => Response.json(ARTICLE)).handler,
      createDocumentHandler(errorReply(400, 'title must be unique')).handler,
    );
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Title'), 'Dup');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('title must be unique')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Dup');
    expect(screen.getByRole('heading', { level: 1, name: 'New entry' })).toBeInTheDocument();
  });

  it('Cancel goes back to the list', async () => {
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('link', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { name: 'List' })).toBeInTheDocument();
  });

  it('asks before leaving a dirty form', async () => {
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler);
    const { user, router } = renderPage();
    await user.type(await screen.findByLabelText('Title'), 'Half');

    await act(() => router.navigate('/admin/content-types'));

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument();
  });

  it('redirects to /403 with the reason when create is denied', async () => {
    const d2 = createDocumentHandler();
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler, d2.handler);

    renderPage(['content_type:read', 'document:read']);

    expect(await screen.findByRole('heading', { name: 'Forbidden' })).toBeInTheDocument();
    expect(screen.getByText(/create/i)).toBeInTheDocument();
    expect(d2.requests).toHaveLength(0);
  });

  it('redirects a single type to its editor', async () => {
    server.use(
      getContentTypeHandler(() =>
        Response.json(makeContentType({ slug: 'article', kind: 'single' })),
      ).handler,
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'List' })).toBeInTheDocument();
  });

  it('shows "Content type not found." with a link to the overview', async () => {
    server.use(getContentTypeHandler(errorReply(404, 'Not found')).handler);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Content type not found.');
    expect(screen.getByRole('link', { name: 'Back to content types' })).toBeInTheDocument();
  });

  it('shows a status while the content type loads', () => {
    server.use(getContentTypeHandler(() => Response.json(ARTICLE)).handler);

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading content type…');
  });
});

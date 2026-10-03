import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import {
  makeContentType,
  makeDocument,
  makeListedItem,
  makeListResponse,
} from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  errorReply,
  getContentTypeHandler,
  getSingleTypeHandler,
  listDocumentsHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import ContentTypePage from './ContentTypePage';

const routes = [{ path: '/admin/content-types/:slug', element: <ContentTypePage /> }];

function renderPage(route: string, permissions = ['content_type:read', 'document:read']) {
  return renderRoutes(routes, {
    route,
    auth: {
      status: 'authenticated',
      user: makeMeUser({ role: makeRole({ permissions }) }),
    },
  });
}

const FORBIDDEN = "You don't have access to this content type.";
const HOME = makeContentType({
  slug: 'home',
  name: 'Home',
  kind: 'single',
  fields: [{ name: 'headline', type: 'text' }],
});

describe('ContentTypePage (AC-32)', () => {
  it('shows a status while the content type loads', () => {
    server.use(getContentTypeHandler().handler, listDocumentsHandler().handler);

    renderPage('/admin/content-types/article');

    expect(screen.getByRole('status')).toHaveTextContent('Loading content type…');
  });

  it('shows a collection type: name, kind, fields, the first page and the total', async () => {
    const d1 = listDocumentsHandler(() =>
      HttpResponse.json(
        makeListResponse({
          items: [
            makeListedItem({
              documentId: 'doc-1',
              updatedAt: '2026-02-03T00:00:00.000Z',
              data: { title: 'Hello world' },
            }),
          ],
          total: 42,
        }),
      ),
    );
    server.use(getContentTypeHandler().handler, d1.handler);

    renderPage('/admin/content-types/article');

    expect(await screen.findByRole('heading', { level: 1, name: 'Article' })).toBeInTheDocument();
    expect(screen.getByText('Kind: Collection type')).toBeInTheDocument();
    const fields = within(screen.getByRole('list', { name: 'Fields' })).getAllByRole('listitem');
    expect(fields.map((li) => li.textContent)).toEqual(['title', 'views', 'featured', 'body']);

    const table = await screen.findByRole('table', { name: 'Documents' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['title', 'updatedAt']);
    expect(
      within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['Hello world', '2026-02-03T00:00:00.000Z']);
    expect(screen.getByText('42 total')).toBeInTheDocument();
    expect(d1.requests).toHaveLength(1);
    expect(d1.requests[0]!.url.search).toBe('');
  });

  it('renders updatedBy by name and an empty cell for a missing value', async () => {
    server.use(
      getContentTypeHandler(() =>
        HttpResponse.json(makeContentType({ listFields: ['id', 'updatedBy', 'views'] })),
      ).handler,
      listDocumentsHandler(() =>
        HttpResponse.json(makeListResponse({ items: [makeListedItem({ id: 7, data: {} })] })),
      ).handler,
    );

    renderPage('/admin/content-types/article');

    const table = await screen.findByRole('table', { name: 'Documents' });
    expect(
      within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['7', 'Jane Doe', '']);
  });

  it('sends the orderBy and sortDir from the page URL, mapped to wire names', async () => {
    const d1 = listDocumentsHandler();
    server.use(getContentTypeHandler().handler, d1.handler);

    renderPage('/admin/content-types/article?orderBy=createdAt&sortDir=asc');

    await screen.findByRole('table', { name: 'Documents' });
    expect(d1.requests[0]!.url.search).toBe('?orderBy=created_at&sortDir=asc');
  });

  it('ignores an unknown sortDir in the page URL', async () => {
    const d1 = listDocumentsHandler();
    server.use(getContentTypeHandler().handler, d1.handler);

    renderPage('/admin/content-types/article?sortDir=sideways');

    await screen.findByRole('table', { name: 'Documents' });
    expect(d1.requests[0]!.url.search).toBe('');
  });

  it('shows the single-type editor for a single type (AC-17)', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(HOME)).handler,
      getSingleTypeHandler(() =>
        HttpResponse.json({ data: makeDocument({ status: 'published', headline: 'Hi' }) }),
      ).handler,
    );

    renderPage('/admin/content-types/home');

    expect(await screen.findByLabelText('Headline')).toHaveValue('Hi');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Published')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByText(/^Kind:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows "Not saved yet" for a single type that was never saved', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(HOME)).handler,
      getSingleTypeHandler(errorReply(404, 'Document not found')).handler,
    );

    renderPage('/admin/content-types/home');

    expect(await screen.findByText('Not saved yet')).toBeInTheDocument();
  });

  it('shows the access alert when the server forbids the single type', async () => {
    server.use(
      getContentTypeHandler(() => HttpResponse.json(HOME)).handler,
      getSingleTypeHandler(errorReply(403, 'Forbidden resource')).handler,
    );

    renderPage('/admin/content-types/home');

    expect(await screen.findByRole('alert')).toHaveTextContent(FORBIDDEN);
  });

  it('shows the access alert when the server forbids the content type', async () => {
    server.use(getContentTypeHandler(errorReply(403, 'Forbidden resource')).handler);

    renderPage('/admin/content-types/article');

    expect(await screen.findByRole('alert')).toHaveTextContent(FORBIDDEN);
  });

  it('shows "Content type not found." on a 404', async () => {
    server.use(getContentTypeHandler(errorReply(404, 'Not found')).handler);

    renderPage('/admin/content-types/missing');

    expect(await screen.findByRole('alert')).toHaveTextContent('Content type not found.');
  });

  it('shows a generic alert when the content type fails otherwise', async () => {
    server.use(getContentTypeHandler(errorReply(400, 'Bad slug')).handler);

    renderPage('/admin/content-types/article');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this content type.");
  });

  it('shows the access alert without a request when only another slug is readable', async () => {
    const d1 = listDocumentsHandler();
    server.use(getContentTypeHandler().handler, d1.handler);

    renderPage('/admin/content-types/article', ['content_type:read', 'document:read:tag']);

    expect(await screen.findByRole('alert')).toHaveTextContent(FORBIDDEN);
    expect(screen.getByRole('heading', { level: 1, name: 'Article' })).toBeInTheDocument();
    expect(d1.requests).toHaveLength(0);
  });

  it('shows the access alert when the server forbids the document list', async () => {
    server.use(
      getContentTypeHandler().handler,
      listDocumentsHandler(errorReply(403, 'Forbidden resource')).handler,
    );

    renderPage('/admin/content-types/article');

    expect(await screen.findByRole('alert')).toHaveTextContent(FORBIDDEN);
  });

  it('shows a generic alert when the document list fails otherwise', async () => {
    server.use(
      getContentTypeHandler().handler,
      listDocumentsHandler(errorReply(400, 'Bad query')).handler,
    );

    renderPage('/admin/content-types/article');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the documents.");
  });

  it('shows a status while the documents load', async () => {
    server.use(getContentTypeHandler().handler, listDocumentsHandler().handler);

    renderPage('/admin/content-types/article');

    expect(await screen.findByText('Loading documents…')).toHaveAttribute('role', 'status');
  });

  it('uses Card, Badge and Table, with the field names in mono font (AC-4, AC-39)', async () => {
    server.use(
      getContentTypeHandler().handler,
      listDocumentsHandler(() => HttpResponse.json(makeListResponse({ items: [], total: 0 })))
        .handler,
    );

    renderPage('/admin/content-types/article');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Article' });
    expect(heading.closest('[data-slot="card"]')).not.toBeNull();
    expect(screen.getByText('Kind: Collection type')).toHaveAttribute('data-slot', 'badge');
    expect(screen.getByRole('list', { name: 'Fields' })).toHaveClass('font-mono');
    expect(await screen.findByRole('table', { name: 'Documents' })).toHaveAttribute(
      'data-slot',
      'table',
    );
  });
});

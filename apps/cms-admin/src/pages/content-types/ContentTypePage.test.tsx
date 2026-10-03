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

  it('shows the collection list for a collection type', async () => {
    const d1 = listDocumentsHandler(() =>
      HttpResponse.json(
        makeListResponse({
          items: [makeListedItem({ documentId: 'doc-1', data: { title: 'Hello world' } })],
          total: 42,
        }),
      ),
    );
    server.use(getContentTypeHandler().handler, d1.handler);

    renderPage('/admin/content-types/article?orderBy=createdAt&sortDir=asc');

    expect(await screen.findByRole('heading', { level: 1, name: 'Article' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Article entries' });
    expect(within(table).getByRole('link', { name: 'Hello world' })).toHaveAttribute(
      'href',
      '/admin/content-types/article/doc-1',
    );
    expect(screen.getByText('Showing 1–20 of 42')).toBeInTheDocument();
    expect(d1.requests[0]!.url.search).toBe('?orderBy=created_at&sortDir=asc');
    expect(screen.queryByText(/^Kind:/)).not.toBeInTheDocument();
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
});

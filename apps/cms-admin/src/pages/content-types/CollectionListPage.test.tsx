import { screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { ListedDocumentItem } from '@/features/content/types';
import { makeContentType, makeListedItem, makeListResponse } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { errorReply, listDocumentsHandler, type Reply } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import CollectionListPage from './CollectionListPage';

const TYPE = makeContentType({ listFields: ['title', 'views', 'updatedAt'] });
const READER = ['content_type:read', 'document:read', 'document:create'];
const IGNORED = 'Some filters in the link were ignored.';

const routes = [
  { path: '/admin/content-types/:slug', element: <CollectionListPage type={TYPE} /> },
];

function renderPage(route = '/admin/content-types/article', permissions = READER) {
  return renderRoutes(routes, {
    route,
    auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
  });
}

const item = (n: number): ListedDocumentItem =>
  makeListedItem({ id: n, documentId: `doc-${n}`, data: { title: `Post ${n}`, views: n } });

/** A D1 reply that pages `total` generated rows by the request's `start` and `size`. */
const paged =
  (total: number): Reply =>
  ({ url }) => {
    const start = Number(url.searchParams.get('start') ?? 0);
    const size = Number(url.searchParams.get('size') ?? 20);
    const items = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) =>
      item(start + i + 1),
    );
    return HttpResponse.json(makeListResponse({ items, total, start, size }));
  };

const search = (router: { state: { location: { search: string } } }) =>
  decodeURIComponent(router.state.location.search);

describe('CollectionListPage', () => {
  it('shows the heading, the table and a Create entry link', async () => {
    const d1 = listDocumentsHandler(paged(3));
    server.use(d1.handler);

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Article' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Article entries' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create entry' })).toHaveAttribute(
      'href',
      '/admin/content-types/article/new',
    );
    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(d1.requests).toHaveLength(1);
    expect(d1.requests[0]!.url.search).toBe('');
  });

  it('gates Create entry on the create permission', async () => {
    server.use(listDocumentsHandler(paged(1)).handler);

    renderPage(undefined, ['content_type:read', 'document:read']);

    await screen.findByRole('table');
    const create = screen.getByRole('button', { name: 'Create entry' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('CollectionListPage URL state (AC-4)', () => {
  it('reads the sort from the URL and sends it with wire names', async () => {
    const d1 = listDocumentsHandler(paged(2));
    server.use(d1.handler);

    renderPage('/admin/content-types/article?orderBy=createdAt&sortDir=asc');

    await screen.findByRole('table');
    expect(d1.requests[0]!.url.search).toBe('?orderBy=created_at&sortDir=asc');
    expect(screen.queryByText(IGNORED)).not.toBeInTheDocument();
  });

  it('drops unknown params, rewrites the URL with replace and announces it', async () => {
    const d1 = listDocumentsHandler(paged(2));
    server.use(d1.handler);

    const { router } = renderPage(
      '/admin/content-types/article?orderBy=coverImage&filters[nope][$eq]=1&sortDir=asc',
    );

    await screen.findByRole('table');
    await waitFor(() => expect(search(router)).toBe('?sortDir=asc'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText(IGNORED)).toHaveAttribute('role', 'status');
    expect(d1.requests.map((r) => r.url.search)).toEqual(['?sortDir=asc']);
  });

  it('canonicalises a URL with defaults silently', async () => {
    server.use(listDocumentsHandler(paged(2)).handler);

    const { router } = renderPage('/admin/content-types/article?size=20&page=1&sortDir=bad');

    await screen.findByRole('table');
    await waitFor(() => expect(search(router)).toBe(''));
    expect(screen.queryByText(IGNORED)).not.toBeInTheDocument();
  });
});

describe('CollectionListPage sorting (AC-20)', () => {
  it('sorts by a header, writes the URL, resets the page and clears the selection', async () => {
    const d1 = listDocumentsHandler(paged(30));
    server.use(d1.handler);
    const { router, user } = renderPage('/admin/content-types/article?page=2');

    await user.click(await screen.findByRole('checkbox', { name: 'Select Post 21' }));
    await user.click(screen.getByRole('button', { name: 'Updated' }));

    await waitFor(() => expect(search(router)).toBe('?orderBy=updatedAt'));
    expect(screen.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await waitFor(() => expect(d1.requests.at(-1)!.url.search).toBe('?orderBy=updated_at'));
    expect(await screen.findByRole('checkbox', { name: 'Select Post 1' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { checked: true })).not.toBeInTheDocument();
  });
});

describe('CollectionListPage search (AC-21)', () => {
  it('sends one request after the debounce, writes q and resets to page 1', async () => {
    const d1 = listDocumentsHandler(paged(30));
    server.use(d1.handler);
    const { router, user } = renderPage('/admin/content-types/article?page=2');

    const box = await screen.findByRole('searchbox', { name: 'Search entries' });
    expect(box).toHaveAttribute('maxlength', '256');
    await user.type(box, 'hello');

    await waitFor(() => expect(search(router)).toBe('?q=hello'));
    await waitFor(() => expect(d1.requests).toHaveLength(2));
    expect(d1.requests[1]!.url.searchParams.get('search')).toBe('hello');
    expect(d1.requests[1]!.url.searchParams.has('start')).toBe(false);
  });

  it('fills the box from q in the URL', async () => {
    const d1 = listDocumentsHandler(paged(2));
    server.use(d1.handler);

    renderPage('/admin/content-types/article?q=news');

    expect(await screen.findByRole('searchbox', { name: 'Search entries' })).toHaveValue('news');
    expect(d1.requests[0]!.url.search).toBe('?search=news');
  });
});

describe('CollectionListPage pagination (AC-23)', () => {
  it('moves to the next page through the URL', async () => {
    const d1 = listDocumentsHandler(paged(45));
    server.use(d1.handler);
    const { router, user } = renderPage();

    await screen.findByText('Showing 1–20 of 45');
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(search(router)).toBe('?page=2'));
    expect(await screen.findByText('Showing 21–40 of 45')).toBeInTheDocument();
    expect(d1.requests.at(-1)!.url.search).toBe('?start=20');
  });

  it('changes the page size and resets to page 1', async () => {
    const d1 = listDocumentsHandler(paged(45));
    server.use(d1.handler);
    const { router, user } = renderPage('/admin/content-types/article?page=2');

    await screen.findByText('Showing 21–40 of 45');
    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await user.click(await screen.findByRole('option', { name: '50' }));

    await waitFor(() => expect(search(router)).toBe('?size=50'));
    expect(await screen.findByText('Showing 1–45 of 45')).toBeInTheDocument();
  });

  it('goes to the last page when page is past the end', async () => {
    server.use(listDocumentsHandler(paged(45)).handler);

    const { router } = renderPage('/admin/content-types/article?page=9');

    await waitFor(() => expect(search(router)).toBe('?page=3'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByText('Showing 41–45 of 45')).toBeInTheDocument();
  });

  it('keeps the old rows busy while the next page loads', async () => {
    let slow = false;
    server.use(
      listDocumentsHandler(async (request) => {
        if (slow) await delay(200);
        return paged(45)(request);
      }).handler,
    );
    const { user } = renderPage();

    await screen.findByText('Showing 1–20 of 45');
    slow = true;
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('link', { name: 'Post 1' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Post 21' })).toBeInTheDocument();
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
  });
});

describe('CollectionListPage states (AC-24)', () => {
  it('shows skeleton rows while loading', () => {
    server.use(listDocumentsHandler(paged(1)).handler);

    renderPage();

    expect(screen.getByRole('group', { name: 'Loading entries' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows the error with Retry, and Retry reloads', async () => {
    let fail = true;
    const d1 = listDocumentsHandler((request) =>
      fail ? errorReply(500, 'Server exploded')(request) : paged(1)(request),
    );
    server.use(d1.handler);
    const { user } = renderPage();

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('Server exploded');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('shows the no-access state on a server 403, without Retry', async () => {
    server.use(listDocumentsHandler(errorReply(403, 'Forbidden resource')).handler);

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You don't have access to Article entries.");
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the no-access state without a request when only another slug is readable', async () => {
    const d1 = listDocumentsHandler();
    server.use(d1.handler);

    renderPage(undefined, ['content_type:read', 'document:read:tag']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to Article entries.",
    );
    expect(d1.requests).toHaveLength(0);
  });

  it('shows "No entries yet." with Create entry for an empty collection', async () => {
    server.use(listDocumentsHandler(paged(0)).handler);

    renderPage();

    const empty = await screen.findByText('No entries yet.');
    const box = empty.parentElement!;
    expect(within(box).getByRole('link', { name: 'Create entry' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the no-match state and clears the search from it', async () => {
    const d1 = listDocumentsHandler(({ url }) =>
      url.searchParams.has('search') ? paged(0)({ url } as never) : paged(2)({ url } as never),
    );
    server.use(d1.handler);
    const { router, user } = renderPage('/admin/content-types/article?q=zzz');

    expect(await screen.findByText('No entries match your search or filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));

    await waitFor(() => expect(search(router)).toBe(''));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search entries' })).toHaveValue('');
  });
});

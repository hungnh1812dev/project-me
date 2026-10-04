import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeContentTypeSummary } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { errorReply, getContentTypesHandler } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

import ContentTypesPage from './ContentTypesPage';

const READER = {
  auth: {
    status: 'authenticated' as const,
    user: makeMeUser({ role: makeRole({ permissions: ['content_type:read'] }) }),
  },
};

describe('ContentTypesPage (AC-31, AC-41)', () => {
  it('shows a status while the content types load', () => {
    server.use(getContentTypesHandler().handler);

    renderWithProviders(<ContentTypesPage />, READER);

    expect(screen.getByRole('status')).toHaveTextContent('Loading content types…');
  });

  it('groups the types into single and collection types, each linking to its page', async () => {
    server.use(
      getContentTypesHandler(() =>
        Response.json([
          makeContentTypeSummary({ slug: 'article', name: 'Article', kind: 'collection' }),
          makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' }),
          makeContentTypeSummary({ slug: 'tag', name: 'Tag', kind: 'collection' }),
        ]),
      ).handler,
    );

    renderWithProviders(<ContentTypesPage />, READER);

    const single = await screen.findByRole('region', { name: 'Single types' });
    const collection = screen.getByRole('region', { name: 'Collection types' });
    expect(within(single).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/admin/content-types/home',
    );
    expect(
      within(collection)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Article', 'Tag']);
    expect(within(collection).getByRole('link', { name: 'Tag' })).toHaveAttribute(
      'href',
      '/admin/content-types/tag',
    );
  });

  it('says so when a group is empty', async () => {
    server.use(getContentTypesHandler(() => Response.json([makeContentTypeSummary()])).handler);

    renderWithProviders(<ContentTypesPage />, READER);

    const single = await screen.findByRole('region', { name: 'Single types' });
    expect(single).toHaveTextContent('None yet.');
  });

  it('encodes the slug in the link', async () => {
    server.use(
      getContentTypesHandler(() =>
        Response.json([makeContentTypeSummary({ slug: 'a b', name: 'Spaced' })]),
      ).handler,
    );

    renderWithProviders(<ContentTypesPage />, READER);

    expect(await screen.findByRole('link', { name: 'Spaced' })).toHaveAttribute(
      'href',
      '/admin/content-types/a%20b',
    );
  });

  it('shows the no-access state on a server 403', async () => {
    server.use(getContentTypesHandler(errorReply(403, 'Forbidden resource')).handler);

    renderWithProviders(<ContentTypesPage />, READER);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to content types.",
    );
  });

  it('shows an alert when the list fails to load otherwise', async () => {
    server.use(getContentTypesHandler(errorReply(400, 'Bad request')).handler);

    renderWithProviders(<ContentTypesPage />, READER);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load content types.");
  });

  it('says so when there are no content types at all', async () => {
    server.use(getContentTypesHandler(() => Response.json([])).handler);

    renderWithProviders(<ContentTypesPage />, READER);

    expect(await screen.findByText('No content types yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows each type as a card with its kind and draft and publish mode (AC-41)', async () => {
    server.use(
      getContentTypesHandler(() =>
        Response.json([
          makeContentTypeSummary({ slug: 'article', name: 'Article', kind: 'collection' }),
          makeContentTypeSummary({
            slug: 'home',
            name: 'Home',
            kind: 'single',
            draftToPublish: false,
          }),
        ]),
      ).handler,
    );

    renderWithProviders(<ContentTypesPage />, READER);

    const collection = await screen.findByRole('region', { name: 'Collection types' });
    const article = within(collection).getByRole('listitem');
    expect(article.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(within(article).getByText('Collection type')).toHaveAttribute('data-slot', 'badge');
    expect(within(article).getByText('Draft & publish')).toBeInTheDocument();

    const home = within(screen.getByRole('region', { name: 'Single types' })).getByRole('listitem');
    expect(within(home).getByText('Single type')).toHaveAttribute('data-slot', 'badge');
    expect(within(home).getByText('No draft & publish')).toBeInTheDocument();
  });

  it('shows each type as a card, with the slug in mono font (AC-4, AC-39)', async () => {
    server.use(
      getContentTypesHandler(() =>
        Response.json([makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' })]),
      ).handler,
    );

    renderWithProviders(<ContentTypesPage />, READER);

    const single = await screen.findByRole('region', { name: 'Single types' });
    expect(single.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(within(single).getByText('home')).toHaveClass('font-mono');
  });
});

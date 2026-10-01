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

describe('ContentTypesPage (AC-31)', () => {
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

  it('shows an alert when the list fails to load', async () => {
    server.use(getContentTypesHandler(errorReply(403, 'Forbidden resource')).handler);

    renderWithProviders(<ContentTypesPage />, READER);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load content types.");
  });

  it('shows each group as a card, with the slugs in mono font (AC-4, AC-39)', async () => {
    server.use(
      getContentTypesHandler(() =>
        Response.json([makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' })]),
      ).handler,
    );

    renderWithProviders(<ContentTypesPage />, READER);

    const single = await screen.findByRole('region', { name: 'Single types' });
    expect(single.querySelector('[data-slot="card"]')).not.toBeNull();
    const collection = screen.getByRole('region', { name: 'Collection types' });
    expect(collection.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(within(single).getByText('home')).toHaveClass('font-mono');
  });
});

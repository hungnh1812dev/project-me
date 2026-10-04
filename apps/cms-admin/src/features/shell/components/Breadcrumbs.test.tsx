import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeQueryClient } from '@/app/queryClient';
import { contentKeys } from '@/features/content/queryKeys';
import { makeContentType, makeContentTypeSummary } from '@/test/contentFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

import Breadcrumbs from './Breadcrumbs';

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

describe('Breadcrumbs', () => {
  it('renders an ordered list with links before the current page', () => {
    renderWithProviders(<Breadcrumbs />, { route: '/admin/content-types' });

    const nav = trail();
    expect(within(nav).getByRole('list').tagName).toBe('OL');
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/admin');
    const current = within(nav).getByText('Content types');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
    expect(current).not.toHaveAttribute('role');
  });

  it('shows Home alone as the current page on /admin', () => {
    renderWithProviders(<Breadcrumbs />, { route: '/admin' });

    expect(within(trail()).queryByRole('link')).toBeNull();
    expect(within(trail()).getByText('Home')).toHaveAttribute('aria-current', 'page');
  });

  it('shows Settings as plain text', () => {
    renderWithProviders(<Breadcrumbs />, { route: '/admin/settings/users' });

    const nav = trail();
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Home']);
    expect(within(nav).getByText('Users')).toHaveAttribute('aria-current', 'page');
  });

  it('shows the slug while the content type is not cached, without fetching', () => {
    const { queryClient } = renderWithProviders(<Breadcrumbs />, {
      route: '/admin/content-types/article',
    });

    expect(within(trail()).getByText('article')).toHaveAttribute('aria-current', 'page');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.isFetching()).toBe(0);
  });

  it('takes the name from the cached content-type list', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(contentKeys.typeList(), [
      makeContentTypeSummary({ slug: 'post', name: 'Post' }),
      makeContentTypeSummary({ slug: 'article', name: 'Article' }),
    ]);
    renderWithProviders(<Breadcrumbs />, { route: '/admin/content-types/article', queryClient });

    expect(within(trail()).getByText('Article')).toHaveAttribute('aria-current', 'page');
  });

  it('prefers the cached content type and follows later cache writes', () => {
    const queryClient = makeQueryClient();
    renderWithProviders(<Breadcrumbs />, { route: '/admin/content-types/article', queryClient });
    expect(within(trail()).getByText('article')).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(
        contentKeys.type('article'),
        makeContentType({ slug: 'article', name: 'Articles' }),
      );
    });

    expect(within(trail()).getByText('Articles')).toHaveAttribute('aria-current', 'page');
  });

  it('puts the middle items of a long trail in a "More breadcrumbs" menu', async () => {
    const { user } = renderWithProviders(<Breadcrumbs />, {
      route: '/admin/content-types/article',
    });

    await user.click(within(trail()).getByRole('button', { name: 'More breadcrumbs' }));

    const item = await screen.findByRole('menuitem', { name: 'Content types' });
    expect(item).toHaveAttribute('href', '/admin/content-types');
  });

  it('has no menu for a trail of two items', () => {
    renderWithProviders(<Breadcrumbs />, { route: '/admin/profile' });

    expect(within(trail()).queryByRole('button')).toBeNull();
  });
});

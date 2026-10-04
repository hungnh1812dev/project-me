import { screen, waitFor } from '@testing-library/react';
import { Link } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import RequireAuth from '@/features/auth/components/RequireAuth';
import { makeMeUser } from '@/test/fixtures';
import { renderRoutes } from '@/test/renderWithProviders';

import AppShell from './AppShell';

const HomeStub: React.FC = () => (
  <section>
    <h1>Welcome home</h1>
    <Link to="/admin/second">Second page</Link>
  </section>
);

const SecondStub: React.FC = () => (
  <section>
    <h1>Second page</h1>
  </section>
);

const NoHeadingStub: React.FC = () => <p>Nothing to see</p>;

const routes = [
  { path: '/login', element: <h1>Sign in</h1> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeStub /> },
          { path: 'second', element: <SecondStub /> },
          { path: 'blank', element: <NoHeadingStub /> },
        ],
      },
    ],
  },
];

const signedIn = { status: 'authenticated' as const, user: makeMeUser() };

afterEach(() => {
  document.title = 'CMS Admin';
});

describe('AppShell', () => {
  it('renders the landmarks in order: skip link, menu, header, main, footer', async () => {
    renderRoutes(routes, { route: '/admin', auth: signedIn });
    await screen.findByRole('heading', { name: 'Welcome home' });

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const header = screen.getByRole('banner');
    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');
    const order = [skip, nav, header, main, footer];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Welcome home' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('makes the skip link the first stop and moves focus to main', async () => {
    const { user } = renderRoutes(routes, { route: '/admin', auth: signedIn });
    await screen.findByRole('heading', { name: 'Welcome home' });

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('shows the product, version and year in the footer', async () => {
    renderRoutes(routes, { route: '/admin', auth: signedIn });
    const footer = await screen.findByRole('contentinfo');

    expect(footer).toHaveTextContent('hungnhdev CMS');
    expect(footer).toHaveTextContent(`v${__APP_VERSION__}`);
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()}`);
  });

  it('titles the document after the page heading without stealing focus on first load', async () => {
    renderRoutes(routes, { route: '/admin', auth: signedIn });
    await screen.findByRole('heading', { name: 'Welcome home' });

    await waitFor(() => expect(document.title).toBe('Welcome home · CMS Admin'));
    expect(document.body).toHaveFocus();
  });

  it('retitles and focuses the new heading after a client-side navigation', async () => {
    const { user } = renderRoutes(routes, { route: '/admin', auth: signedIn });

    await user.click(await screen.findByRole('link', { name: 'Second page' }));

    const heading = await screen.findByRole('heading', { name: 'Second page' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe('Second page · CMS Admin');
  });

  it('focuses main and uses the bare title when the page has no heading', async () => {
    const { router } = renderRoutes(routes, { route: '/admin', auth: signedIn });
    await screen.findByRole('heading', { name: 'Welcome home' });

    await router.navigate('/admin/blank');

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(document.title).toBe('CMS Admin');
  });

  it('follows a heading that renders after the data loads', async () => {
    renderRoutes(routes, { route: '/admin/blank', auth: signedIn });
    const paragraph = await screen.findByText('Nothing to see');

    const h1 = document.createElement('h1');
    h1.textContent = 'Loaded later';
    paragraph.parentElement?.append(h1);

    await waitFor(() => expect(document.title).toBe('Loaded later · CMS Admin'));
  });

  it('is not rendered on public routes', async () => {
    renderRoutes(routes, { route: '/login', auth: { status: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Skip to content' })).not.toBeInTheDocument();
  });
});

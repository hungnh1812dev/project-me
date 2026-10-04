import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RequireAuth from '@/features/auth/components/RequireAuth';
import { userLoaded } from '@/features/auth/store/AuthSlice';
import { contentKeys } from '@/features/content/queryKeys';
import { makeContentTypeSummary } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import { errorReply, getContentTypesHandler } from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import { SIDEBAR_OPEN_KEY, sidebarGroupKey } from '../sidebarState';
import AppShell from './AppShell';

const routes = [
  { path: '/login', element: <h1>Sign in</h1> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <h1>Home page</h1> },
          { path: 'settings/users', element: <h1>Users page</h1> },
          { path: 'content-types/:slug', element: <h1>Content page</h1> },
        ],
      },
    ],
  },
];

const userWith = (permissions: string[]) =>
  makeMeUser({ role: makeRole({ permissions: ['document:read', ...permissions] }) });

const TYPES = [
  makeContentTypeSummary({ slug: 'post', name: 'Post', kind: 'collection' }),
  makeContentTypeSummary({ slug: 'article', name: 'Article', kind: 'collection' }),
];

/** No retry, so a failed C1 shows its error at once. */
const noRetryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });

function renderShell(
  permissions: string[],
  { route = '/admin', queryClient }: { route?: string; queryClient?: QueryClient } = {},
) {
  return renderRoutes(routes, {
    route,
    queryClient,
    auth: { status: 'authenticated', user: userWith(permissions) },
  });
}

const nav = () => screen.getByRole('navigation', { name: 'Main' });

afterEach(() => {
  window.localStorage.clear();
});

describe('AppSidebar: content section', () => {
  it('is not rendered and sends no C1 request without content_type:read (AC-23)', async () => {
    const c1 = getContentTypesHandler();
    server.use(c1.handler);
    renderShell([]);
    await screen.findByRole('heading', { name: 'Home page' });

    expect(within(nav()).queryByRole('button', { name: 'Content' })).not.toBeInTheDocument();
    expect(c1.requests).toHaveLength(0);
  });

  it('shows skeleton rows while the list loads, without blocking the page (AC-24)', async () => {
    server.use(
      getContentTypesHandler(async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }).handler,
    );
    renderShell(['content_type:read']);

    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
    expect(within(nav()).getByText('Loading content types')).toBeInTheDocument();
  });

  it('groups the readable types by kind, sorted by name, with "None" for an empty group (AC-22)', async () => {
    server.use(getContentTypesHandler(() => HttpResponse.json(TYPES)).handler);
    renderShell(['content_type:read']);

    const collection = await within(nav()).findByRole('list', { name: 'Collection types' });
    expect(
      within(collection)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Article', 'Post']);
    expect(within(collection).getByRole('link', { name: 'Article' })).toHaveAttribute(
      'href',
      '/admin/content-types/article',
    );
    const single = within(nav()).getByRole('list', { name: 'Single types' });
    expect(within(single).queryAllByRole('link')).toHaveLength(0);
    expect(within(single).getByText('None')).toBeInTheDocument();
  });

  it('hides the types the user may not read', async () => {
    server.use(getContentTypesHandler(() => HttpResponse.json(TYPES)).handler);
    const user = makeMeUser({
      role: makeRole({ permissions: ['content_type:read', 'document:read:post'] }),
    });
    renderRoutes(routes, { route: '/admin', auth: { status: 'authenticated', user } });

    expect(await within(nav()).findByRole('link', { name: 'Post' })).toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Article' })).not.toBeInTheDocument();
  });

  it('offers Retry when the list fails, and recovers (AC-24)', async () => {
    let fail = true;
    server.use(
      getContentTypesHandler(() =>
        fail ? HttpResponse.json({ message: 'Boom' }, { status: 500 }) : HttpResponse.json(TYPES),
      ).handler,
    );
    const { user } = renderShell(['content_type:read'], { queryClient: noRetryClient() });

    expect(await within(nav()).findByText("Couldn't load content types.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home page' })).toBeInTheDocument();

    fail = false;
    await user.click(within(nav()).getByRole('button', { name: 'Retry' }));

    expect(await within(nav()).findByRole('link', { name: 'Article' })).toBeInTheDocument();
    expect(within(nav()).queryByText("Couldn't load content types.")).not.toBeInTheDocument();
  });

  it('is hidden when the list answers 403 (AC-24)', async () => {
    const c1 = getContentTypesHandler(errorReply(403, 'Forbidden'));
    server.use(c1.handler);
    renderShell(['content_type:read', 'user:read'], { queryClient: noRetryClient() });

    await waitFor(() => expect(c1.requests).toHaveLength(1));
    expect(await within(nav()).findByRole('link', { name: 'Users' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(nav()).queryByText('Loading content types')).not.toBeInTheDocument(),
    );
    expect(within(nav()).queryByRole('button', { name: 'Content' })).not.toBeInTheDocument();
    expect(within(nav()).queryByText("Couldn't load content types.")).not.toBeInTheDocument();
  });

  it('shows a new type after the list is invalidated (AC-30)', async () => {
    let types = TYPES;
    server.use(getContentTypesHandler(() => HttpResponse.json(types)).handler);
    const { queryClient } = renderShell(['content_type:read']);
    await within(nav()).findByRole('link', { name: 'Article' });

    types = [...TYPES, makeContentTypeSummary({ slug: 'home', name: 'Home', kind: 'single' })];
    await act(() => queryClient.invalidateQueries({ queryKey: contentKeys.typeList() }));

    expect(await within(nav()).findByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('AppSidebar: settings section', () => {
  it('is not rendered when no settings link is allowed (AC-25)', async () => {
    renderShell([]);
    await screen.findByRole('heading', { name: 'Home page' });

    expect(within(nav()).queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists only the allowed links, and a manager grant qualifies (AC-25)', async () => {
    renderShell(['user:read', 'media:manager']);

    const settings = await within(nav()).findByRole('list', { name: 'Settings' });
    expect(
      within(settings)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Users', 'Media library']);
    expect(within(settings).getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/settings/users',
    );
  });

  it('updates without a reload when the permissions change (AC-30)', async () => {
    const { store } = renderShell([]);
    await screen.findByRole('heading', { name: 'Home page' });

    act(() => {
      store.dispatch(userLoaded(userWith(['role:read'])));
    });

    expect(await within(nav()).findByRole('link', { name: 'Roles' })).toBeInTheDocument();
  });
});

describe('AppSidebar: behaviour', () => {
  it('marks the link of the current route with aria-current (AC-27)', async () => {
    renderShell(['user:read', 'role:read'], { route: '/admin/settings/users' });

    const users = await within(nav()).findByRole('link', { name: 'Users' });
    expect(users).toHaveAttribute('aria-current', 'page');
    expect(users).toHaveAttribute('data-active');
    expect(within(nav()).getByRole('link', { name: 'Roles' })).not.toHaveAttribute('aria-current');
  });

  it('collapses a group through its disclosure and remembers it (AC-29)', async () => {
    const first = renderShell(['user:read']);
    const toggle = await within(nav()).findByRole('button', { name: 'Settings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await first.user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(nav()).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(sidebarGroupKey('settings'))).toBe('false');
    first.unmount();

    renderShell(['user:read']);
    expect(await within(nav()).findByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('collapses to the rail with the toggle and Ctrl+B, and remembers it (AC-28)', async () => {
    const first = renderShell(['user:read']);
    await screen.findByRole('heading', { name: 'Home page' });
    const sidebar = () => document.querySelector('[data-slot="sidebar"]');
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');

    await first.user.click(screen.getByRole('button', { name: 'Toggle menu' }));

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
    expect(window.localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('false');
    // The rail keeps each item's accessible name.
    expect(within(nav()).getByRole('link', { name: 'Users' })).toBeInTheDocument();

    await first.user.keyboard('{Control>}b{/Control}');
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');
    expect(window.localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('true');

    await first.user.keyboard('{Control>}b{/Control}');
    first.unmount();
    renderShell(['user:read']);
    await screen.findByRole('heading', { name: 'Home page' });
    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('closes the mobile drawer when a link is followed (AC-35)', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    const { user, router } = renderShell(['user:read']);
    await screen.findByRole('heading', { name: 'Home page' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(within(drawer).getByRole('link', { name: 'Users' }));

    expect(await screen.findByRole('heading', { name: 'Users page' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/settings/users');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

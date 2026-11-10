import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { EN_TEXT } from '@configs/locales/en';
import { NAV_GROUP_OPEN_STORAGE_KEY } from '@configs/NavSections.constants';
import type { Role } from '@features/access/Access.api';
import type { CurrentUser } from '@features/auth/Auth.slice';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const nav = EN_TEXT.access.nav;

const readerRole: Role = {
  id: 'role_reader',
  slug: 'reader',
  name: 'Reader',
  rank: 10,
  isSystem: false,
  accountCount: 1,
  manageable: false,
  permissions: [
    {
      subject: 'post',
      action: 'read',
      readableFields: null,
      writableFields: null,
      conditions: null,
    },
  ],
};

const contentTypes = [
  {
    slug: 'cv-page',
    displayName: 'CV Page',
    kind: 'single',
    draftAndPublish: false,
    fields: [],
  },
  {
    slug: 'post',
    displayName: 'Blog Post',
    kind: 'collection',
    draftAndPublish: false,
    fields: [],
  },
];

async function open(
  user: CurrentUser = TEST_USER,
  handlers: Record<string, FakeHandler> = {},
  roles: Role[] = [],
) {
  const { services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${API_ENDPOINTS.ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: roles },
    }),
    [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => ({
      status: 200,
      data: { data: contentTypes },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services);
}

const mediaReaderRole: Role = {
  ...readerRole,
  id: 'role_media',
  slug: 'media-reader',
  permissions: [{ ...readerRole.permissions[0]!, subject: 'media' }],
};

const mainNav = () => screen.getByRole('navigation', { name: nav.label });

describe('SideMenu', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the owner all three sections with their items', async () => {
    await open();

    expect(await within(mainNav()).findByRole('link', { name: 'CV Page' })).toHaveAttribute(
      'href',
      '/content/cv-page',
    );
    expect(within(mainNav()).getByRole('link', { name: 'CV Page' })).toHaveAttribute(
      'title',
      'CV Page',
    );
    const menu = within(mainNav());
    for (const heading of [
      nav.content,
      nav.singleTypes,
      nav.collectionTypes,
      nav.utilities,
      nav.systemSettings,
    ]) {
      expect(menu.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    for (const label of [
      'Blog Post',
      nav.media,
      nav.accounts,
      nav.roles,
      nav.apiTokens,
      nav.reviewer,
    ]) {
      expect(menu.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('lists Content, Utilities and System settings as three groups in order', async () => {
    await open();
    await within(mainNav()).findByRole('link', { name: 'Blog Post' });

    const headings = within(mainNav())
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([nav.content, nav.utilities, nav.systemSettings]);
  });

  it('collapses a sub-group and keeps it collapsed after the menu is opened again', async () => {
    await open();
    const toggle = await within(mainNav()).findByRole('button', { name: nav.collectionTypes });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(mainNav()).getByRole('link', { name: 'Blog Post' })).toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(mainNav()).queryByRole('link', { name: 'Blog Post' })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(NAV_GROUP_OPEN_STORAGE_KEY) ?? '{}')).toEqual({
      collectionTypes: false,
    });

    cleanup();
    await open();
    const reopened = await within(mainNav()).findByRole('button', { name: nav.collectionTypes });
    expect(reopened).toHaveAttribute('aria-expanded', 'false');
    expect(within(mainNav()).getByRole('button', { name: nav.singleTypes })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps sub-groups open when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await open();

    const toggle = await within(mainNav()).findByRole('button', { name: nav.collectionTypes });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides sections the caller has no item for', async () => {
    await open({ ...TEST_USER, role: 'reader' }, {}, [readerRole]);

    expect(await within(mainNav()).findByRole('link', { name: 'Blog Post' })).toBeInTheDocument();
    const menu = within(mainNav());
    expect(menu.queryByRole('heading', { name: nav.systemSettings })).not.toBeInTheDocument();
    expect(menu.queryByRole('heading', { name: nav.utilities })).not.toBeInTheDocument();
    expect(menu.queryByRole('heading', { name: nav.singleTypes })).not.toBeInTheDocument();
  });

  it('shows the Welcome panel and no nav landmark when no page is readable', async () => {
    await open(
      { ...TEST_USER, role: 'guest' },
      {
        [`GET ${API_ENDPOINTS.ROLES.LIST}`]: () => ({ status: 403 }),
        [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
      },
    );

    const heading = await screen.findByRole('heading', { name: nav.welcomeTitle });
    const panel = heading.closest('section') as HTMLElement;
    expect(panel).toHaveAccessibleName(nav.welcomeTitle);
    expect(within(panel).getByText(nav.welcomeText)).toBeInTheDocument();
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: nav.label })).not.toBeInTheDocument();
  });

  it('shows only File Library to a caller holding only media read', async () => {
    await open({ ...TEST_USER, role: 'media-reader' }, {}, [mediaReaderRole]);

    expect(await within(mainNav()).findByRole('link', { name: nav.media })).toBeInTheDocument();
    expect(within(mainNav()).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: nav.welcomeTitle })).not.toBeInTheDocument();
  });

  it('shows the skeleton and no Welcome panel while the catalog loads', async () => {
    await open(TEST_USER, {
      [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => new Promise(() => {}),
    });

    expect(await within(mainNav()).findByText(nav.loading)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: nav.welcomeTitle })).not.toBeInTheDocument();
  });

  it('keeps the retry row and no Welcome panel when the catalog fails for a no-access caller', async () => {
    await open(
      { ...TEST_USER, role: 'guest' },
      {
        [`GET ${API_ENDPOINTS.ROLES.LIST}`]: () => ({ status: 403 }),
        [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => ({ status: 500 }),
      },
    );

    expect(await screen.findByText(nav.catalogError)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: nav.welcomeTitle })).not.toBeInTheDocument();
  });

  it('holds navigation only: no Sign out or Security link', async () => {
    await open();

    await within(mainNav()).findByRole('link', { name: 'Blog Post' });
    expect(screen.queryByRole('button', { name: EN_TEXT.session.signOut })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: EN_TEXT.session.securityLink }),
    ).not.toBeInTheDocument();
  });

  it('marks the open page as current', async () => {
    await open();
    const link = await within(mainNav()).findByRole('link', { name: 'Blog Post' });
    expect(link).not.toHaveAttribute('aria-current');

    await userEvent.click(link);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('aria-[current=page]:bg-nav-active', 'rounded-item');
    const others = within(mainNav())
      .getAllByRole('link')
      .filter((other) => other !== link);
    for (const other of others) expect(other).not.toHaveAttribute('aria-current');
  });

  it('shows one line with a retry when the catalog fails, then recovers', async () => {
    let attempts = 0;
    await open(TEST_USER, {
      [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => {
        attempts += 1;
        return attempts === 1 ? { status: 500 } : { status: 200, data: { data: contentTypes } };
      },
    });

    expect(await screen.findByText(nav.catalogError)).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: nav.media })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: nav.retryCatalog }));
    expect(await within(mainNav()).findByRole('link', { name: 'Blog Post' })).toBeInTheDocument();
    expect(screen.queryByText(nav.catalogError)).not.toBeInTheDocument();
  });
});

describe('MobileMenu', () => {
  it('opens the menu in a sheet and closes it on Esc', async () => {
    await open();
    const trigger = screen.getByRole('button', { name: nav.menu });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const sheet = await screen.findByRole('dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await within(sheet).findByRole('link', { name: nav.media })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet when a link is chosen', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: nav.menu }));
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(await within(sheet).findByRole('link', { name: nav.media }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet with its close button', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: nav.menu }));
    await userEvent.click(await screen.findByRole('button', { name: nav.closeMenu }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

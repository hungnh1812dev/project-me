import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../test/FakeApi.fixture';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../test/RenderApp.fixture';
import { COPY } from '../config/Copy.constants';
import { API_ENDPOINTS } from '../config/Api.endpoints';
import type { Role } from '../features/access/Access.api';
import type { CurrentUser } from '../features/auth/Auth.slice';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const nav = COPY.access.nav;

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
  { slug: 'cv-page', kind: 'single', draftAndPublish: false, fields: [] },
  { slug: 'post', kind: 'collection', draftAndPublish: false, fields: [] },
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

const mainNav = () => screen.getByRole('navigation', { name: nav.label });

describe('SideMenu', () => {
  it('shows the owner all three sections with their items', async () => {
    await open();

    expect(
      await within(mainNav()).findByRole('link', { name: 'cv-page' }),
    ).toHaveAttribute('href', '/content/cv-page');
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
      'post',
      nav.media,
      nav.accounts,
      nav.roles,
      nav.apiTokens,
      nav.reviewer,
    ]) {
      expect(menu.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('hides sections the caller has no item for', async () => {
    await open({ ...TEST_USER, role: 'reader' }, {}, [readerRole]);

    expect(
      await within(mainNav()).findByRole('link', { name: 'post' }),
    ).toBeInTheDocument();
    const menu = within(mainNav());
    expect(
      menu.queryByRole('heading', { name: nav.systemSettings }),
    ).not.toBeInTheDocument();
    expect(
      menu.queryByRole('heading', { name: nav.utilities }),
    ).not.toBeInTheDocument();
    expect(
      menu.queryByRole('heading', { name: nav.singleTypes }),
    ).not.toBeInTheDocument();
  });

  it('gives a reviewer no Security link', async () => {
    await open({ ...TEST_USER, role: 'reviewer' }, {}, [
      { ...readerRole, slug: 'reviewer' },
    ]);

    await within(mainNav()).findByRole('link', { name: 'post' });
    expect(
      screen.queryByRole('link', { name: COPY.session.securityLink }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: COPY.session.signOut }),
    ).toBeInTheDocument();
  });

  it('marks the open page as current', async () => {
    await open();
    const link = await within(mainNav()).findByRole('link', { name: 'post' });
    expect(link).not.toHaveAttribute('aria-current');

    await userEvent.click(link);
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('shows one line with a retry when the catalog fails, then recovers', async () => {
    let attempts = 0;
    await open(TEST_USER, {
      [`GET ${API_ENDPOINTS.CONTENT_TYPES.LIST}`]: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500 }
          : { status: 200, data: { data: contentTypes } };
      },
    });

    expect(await screen.findByText(nav.catalogError)).toBeInTheDocument();
    expect(
      within(mainNav()).getByRole('link', { name: nav.media }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: nav.retryCatalog }),
    );
    expect(
      await within(mainNav()).findByRole('link', { name: 'post' }),
    ).toBeInTheDocument();
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
    expect(
      await within(sheet).findByRole('link', { name: nav.media }),
    ).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet when a link is chosen', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: nav.menu }));
    const sheet = await screen.findByRole('dialog');

    await userEvent.click(
      await within(sheet).findByRole('link', { name: nav.media }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet with its close button', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: nav.menu }));
    await userEvent.click(
      await screen.findByRole('button', { name: nav.closeMenu }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

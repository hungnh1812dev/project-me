import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/RenderApp.fixture';
import { COPY } from '../../config/Copy.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { APP_ROUTES, rolePermissionsPath } from '../../config/App.routes';
import type { CurrentUser } from '../auth/Auth.slice';
import type { ContentType } from '../content-types';
import type { Account, PermissionRow, Role } from './access.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { ACCOUNTS, ROLES, CONTENT_TYPES } = API_ENDPOINTS;
const copy = COPY.access;

function rows(...specs: [string, PermissionRow['action']][]): PermissionRow[] {
  return specs.map(([subject, action]) => ({
    subject,
    action,
    readableFields: null,
    writableFields: null,
    conditions: null,
  }));
}

const ownerRole: Role = {
  id: 'role_owner',
  slug: 'owner',
  name: 'Owner',
  rank: 100,
  isSystem: true,
  accountCount: 1,
  manageable: false,
  permissions: [],
};
const adminRole: Role = {
  id: 'role_admin',
  slug: 'admin',
  name: 'Admin',
  rank: 80,
  isSystem: true,
  accountCount: 1,
  manageable: true,
  permissions: rows(
    ['accounts', 'read'],
    ['roles', 'read'],
    ['article', 'read'],
  ),
};
const editorRole: Role = {
  id: 'role_editor',
  slug: 'editor',
  name: 'Editor',
  rank: 50,
  isSystem: true,
  accountCount: 2,
  manageable: true,
  permissions: rows(['article', 'read']),
};
const reviewerRole: Role = {
  id: 'role_reviewer',
  slug: 'reviewer',
  name: 'Reviewer',
  rank: 20,
  isSystem: true,
  accountCount: 0,
  manageable: true,
  permissions: [],
};

const article: ContentType = {
  slug: 'article',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    {
      path: 'title',
      type: 'text',
      system: false,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: 'string',
      sensitive: false,
    },
    {
      path: 'email',
      type: 'text',
      system: false,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: 'string',
      sensitive: true,
    },
  ],
};

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc_x',
    email: 'x@domain.localhost',
    displayName: 'X',
    status: 'active',
    twoFactorEnabled: false,
    twoFactorMethod: null,
    role: { id: editorRole.id, slug: 'editor', name: 'Editor', rank: 50 },
    createdAt: '2026-10-01T00:00:00.000Z',
    manageable: true,
    ...overrides,
  };
}

const linh = account({
  id: 'acc_linh',
  email: 'linh@domain.localhost',
  displayName: 'Linh Pham',
});

async function open(
  route: string,
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [ownerRole, adminRole, editorRole, reviewerRole] },
    }),
    [`GET ${CONTENT_TYPES.LIST}`]: () => ({
      status: 200,
      data: { data: [article] },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, route);
  return { api, services };
}

function accountsBody(list: Account[], page = 1, total = list.length) {
  return { data: list, meta: { page, pageSize: 20, total } };
}

const adminUser: CurrentUser = { ...TEST_USER, id: 'acc_admin', role: 'admin' };

describe('AccountsPage', () => {
  const listHandler: FakeHandler = () => ({
    status: 200,
    data: accountsBody([linh]),
  });

  it('lists accounts for the owner with invite and disable actions', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
    });
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.accounts.invite }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    ).toBeVisible();
  });

  it('shows an empty state that points to the first action', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: () => ({ status: 200, data: accountsBody([]) }),
    });
    expect(await screen.findByText(copy.accounts.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.accounts.emptyHint)).toBeInTheDocument();
  });

  it('shows an error with a retry that reloads', async () => {
    let calls = 0;
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: () => {
        calls += 1;
        return calls === 1
          ? { status: 500 }
          : { status: 200, data: accountsBody([linh]) };
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByText(copy.accounts.loadFailed),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.errors.retry }));
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
  });

  it('hides invite and disable when the role cannot create or update accounts', async () => {
    await open(APP_ROUTES.ACCOUNTS, adminUser, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
    });
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.accounts.invite }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    ).not.toBeInTheDocument();
  });

  it('shows no disable action for accounts the caller cannot manage', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: () => ({
        status: 200,
        data: accountsBody([{ ...linh, manageable: false }]),
      }),
    });
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    ).not.toBeInTheDocument();
  });

  it('shows a calm message when the server answers 403', async () => {
    await open(APP_ROUTES.ACCOUNTS, adminUser, {
      [`GET ${ACCOUNTS.LIST}`]: () => ({ status: 403 }),
    });
    expect(
      await screen.findByText(copy.accounts.forbidden),
    ).toBeInTheDocument();
  });

  it('invites an account: validates, offers only assignable roles, then confirms', async () => {
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
      [`POST ${ACCOUNTS.LIST}`]: () => ({
        status: 201,
        data: { ...linh, id: 'acc_new', invitationSent: true },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.accounts.invite }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: copy.invite.title,
    });

    await user.click(
      within(dialog).getByRole('button', { name: copy.invite.submit }),
    );
    expect(
      await within(dialog).findByText(copy.invite.validation.emailRequired),
    ).toBeInTheDocument();
    expect(api.callsTo(`POST ${ACCOUNTS.LIST}`)).toHaveLength(0);

    const roleSelect = within(dialog).getByLabelText(
      new RegExp(copy.invite.roleLabel),
    );
    const optionNames = within(roleSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionNames).toEqual([
      copy.invite.rolePlaceholder,
      'Admin',
      'Editor',
    ]);

    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.emailLabel)),
      'new@domain.localhost',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.displayNameLabel)),
      'New Person',
    );
    await user.selectOptions(roleSelect, 'Editor');
    await user.click(
      within(dialog).getByRole('button', { name: copy.invite.submit }),
    );

    expect(
      await screen.findByText(copy.accounts.invited('linh@domain.localhost')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [call] = api.callsTo(`POST ${ACCOUNTS.LIST}`);
    expect(JSON.parse(call?.data as string)).toEqual({
      email: 'new@domain.localhost',
      displayName: 'New Person',
      roleId: editorRole.id,
    });
  });

  it('returns focus to the Invite button after Escape and Cancel', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
    });
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', {
      name: copy.accounts.invite,
    });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: copy.invite.cancel,
      }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('warns when the invitation email could not be sent', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
      [`POST ${ACCOUNTS.LIST}`]: () => ({
        status: 201,
        data: { ...linh, invitationSent: false },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.accounts.invite }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.emailLabel)),
      'linh@domain.localhost',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.displayNameLabel)),
      'Linh Pham',
    );
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(copy.invite.roleLabel)),
      'Editor',
    );
    await user.click(
      within(dialog).getByRole('button', { name: copy.invite.submit }),
    );
    expect(
      await screen.findByText(
        copy.accounts.invitedNoEmail('linh@domain.localhost'),
      ),
    ).toBeInTheDocument();
  });

  it('keeps the dialog open and marks the email when it is already taken', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
      [`POST ${ACCOUNTS.LIST}`]: () => ({
        status: 409,
        data: { errorCode: 'ACCOUNT_EMAIL_TAKEN', message: 'taken' },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.accounts.invite }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.emailLabel)),
      'linh@domain.localhost',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.invite.displayNameLabel)),
      'Linh Pham',
    );
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(copy.invite.roleLabel)),
      'Editor',
    );
    await user.click(
      within(dialog).getByRole('button', { name: copy.invite.submit }),
    );
    expect(
      await within(dialog).findByText(copy.invite.errors.emailTaken),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText(new RegExp(copy.invite.emailLabel)),
    ).toHaveValue('linh@domain.localhost');
  });

  it('disables an account after a confirmation that names it', async () => {
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
      [`POST ${ACCOUNTS.DISABLE('acc_linh')}`]: () => ({ status: 204 }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(api.callsTo(`POST ${ACCOUNTS.DISABLE('acc_linh')}`)).toHaveLength(0);
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.disable.submit('Linh Pham'),
      }),
    );
    expect(
      await screen.findByText(copy.accounts.disabled('Linh Pham')),
    ).toBeInTheDocument();
    expect(api.callsTo(`POST ${ACCOUNTS.DISABLE('acc_linh')}`)).toHaveLength(1);
  });

  it('closes the confirmation with Cancel without calling the API', async () => {
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: copy.disable.cancel,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.callsTo(`POST ${ACCOUNTS.DISABLE('acc_linh')}`)).toHaveLength(0);
  });

  it('shows a rank error from the server inside the confirmation', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: listHandler,
      [`POST ${ACCOUNTS.DISABLE('acc_linh')}`]: () => ({
        status: 403,
        data: { errorCode: 'ACCESS_RANK_FORBIDDEN', message: 'no' },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.accounts.disableLabel('Linh Pham'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.disable.submit('Linh Pham'),
      }),
    );
    expect(
      await within(dialog).findByText(copy.errors.rankForbidden),
    ).toBeInTheDocument();
  });
});

describe('AccountsPage enable, resend and paging', () => {
  const disabledLinh = account({ ...linh, status: 'disabled' });
  const invitedMai = account({
    id: 'acc_mai',
    email: 'mai@domain.localhost',
    displayName: 'Mai Tran',
    status: 'invited',
  });
  const list =
    (accountRows: Account[]): FakeHandler =>
    () => ({
      status: 200,
      data: accountsBody(accountRows),
    });
  const enableName = copy.accounts.enableLabel('Linh Pham');
  const resendName = copy.accounts.resendLabel('Mai Tran');

  it('shows Enable only on disabled rows and Resend only on invited rows', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([disabledLinh, invitedMai]),
    });
    expect(
      await screen.findByRole('button', { name: enableName }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: resendName }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: copy.accounts.enableLabel('Mai Tran'),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: copy.accounts.resendLabel('Linh Pham'),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: copy.accounts.disableLabel('Mai Tran'),
      }),
    ).toBeInTheDocument();
  });

  it('hides both actions for rows the caller cannot manage', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([
        { ...disabledLinh, manageable: false },
        { ...invitedMai, manageable: false },
      ]),
    });
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enableName }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: resendName }),
    ).not.toBeInTheDocument();
  });

  it('hides both actions when the role holds neither permission', async () => {
    await open(APP_ROUTES.ACCOUNTS, adminUser, {
      [`GET ${ACCOUNTS.LIST}`]: list([disabledLinh, invitedMai]),
    });
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enableName }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: resendName }),
    ).not.toBeInTheDocument();
  });

  it('enables an account without a confirmation and refreshes the list', async () => {
    let enabled = false;
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: () => ({
        status: 200,
        data: accountsBody([enabled ? linh : disabledLinh]),
      }),
      [`POST ${ACCOUNTS.ENABLE('acc_linh')}`]: () => {
        enabled = true;
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: enableName }));
    expect(
      await screen.findByText(copy.accounts.enabled('Linh Pham')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo(`POST ${ACCOUNTS.ENABLE('acc_linh')}`)).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: enableName }),
      ).not.toBeInTheDocument(),
    );
  });

  it('explains an enable that lost a race', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([disabledLinh]),
      [`POST ${ACCOUNTS.ENABLE('acc_linh')}`]: () => ({
        status: 409,
        data: { errorCode: 'ACCOUNT_NOT_DISABLED', message: 'x' },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: enableName }));
    expect(
      await screen.findByText(copy.accounts.alreadyEnabled),
    ).toBeInTheDocument();
  });

  it('shows a rank error from the server when enabling', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([disabledLinh]),
      [`POST ${ACCOUNTS.ENABLE('acc_linh')}`]: () => ({
        status: 403,
        data: { errorCode: 'ACCESS_RANK_FORBIDDEN', message: 'no' },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: enableName }));
    expect(
      await screen.findByText(copy.errors.rankForbidden),
    ).toBeInTheDocument();
  });

  it('resends an invite and says it was sent', async () => {
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([invitedMai]),
      [`POST ${ACCOUNTS.RESEND_INVITE('acc_mai')}`]: () => ({
        status: 200,
        data: { invitationSent: true },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: resendName }));
    expect(
      await screen.findByText(copy.accounts.resent('mai@domain.localhost')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      api.callsTo(`POST ${ACCOUNTS.RESEND_INVITE('acc_mai')}`),
    ).toHaveLength(1);
  });

  it('says the mail failed when invitationSent is false', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([invitedMai]),
      [`POST ${ACCOUNTS.RESEND_INVITE('acc_mai')}`]: () => ({
        status: 200,
        data: { invitationSent: false },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: resendName }));
    expect(
      await screen.findByText(
        copy.accounts.resentNoEmail('mai@domain.localhost'),
      ),
    ).toBeInTheDocument();
  });

  it('shows a wait message from Retry-After when resend is throttled', async () => {
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: list([invitedMai]),
      [`POST ${ACCOUNTS.RESEND_INVITE('acc_mai')}`]: () => ({
        status: 429,
        headers: { 'retry-after': '90' },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: resendName }));
    expect(
      await screen.findByText(COPY.password.errors.rateLimitedMinutes(2)),
    ).toBeInTheDocument();
  });

  it('pages through accounts and shows the range', async () => {
    const second = account({
      id: 'acc_two',
      displayName: 'Second Person',
      email: 'two@domain.localhost',
    });
    const { api } = await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: (config) => {
        const page = Number((config.params as { page: number }).page);
        return {
          status: 200,
          data: accountsBody([page === 1 ? linh : second], page, 21),
        };
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(
      screen.getByText(copy.accounts.pagination.range(1, 1, 21)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.accounts.pagination.previous }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: copy.accounts.pagination.next }),
    );
    expect(await screen.findByText('Second Person')).toBeInTheDocument();
    expect(
      screen.getByText(copy.accounts.pagination.range(21, 21, 21)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.accounts.pagination.next }),
    ).toBeDisabled();
    expect(api.callsTo(`GET ${ACCOUNTS.LIST}`).at(-1)?.params).toMatchObject({
      page: 2,
    });
    await user.click(
      screen.getByRole('button', { name: copy.accounts.pagination.previous }),
    );
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
  });

  it('keeps the page after an action and steps back when the last row goes away', async () => {
    const second = account({
      id: 'acc_two',
      displayName: 'Second Person',
      email: 'two@domain.localhost',
    });
    let gone = false;
    await open(APP_ROUTES.ACCOUNTS, TEST_USER, {
      [`GET ${ACCOUNTS.LIST}`]: (config) => {
        const page = Number((config.params as { page: number }).page);
        if (page === 1)
          return { status: 200, data: accountsBody([linh], 1, gone ? 1 : 21) };
        return {
          status: 200,
          data: accountsBody(gone ? [] : [second], page, gone ? 1 : 21),
        };
      },
      [`POST ${ACCOUNTS.DISABLE('acc_two')}`]: () => {
        gone = true;
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.accounts.pagination.next,
      }),
    );
    await screen.findByText('Second Person');
    await user.click(
      screen.getByRole('button', {
        name: copy.accounts.disableLabel('Second Person'),
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: copy.disable.submit('Second Person'),
      }),
    );
    expect(await screen.findByText('Linh Pham')).toBeInTheDocument();
    expect(screen.queryByText(copy.accounts.empty)).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows Accounts and Roles to the owner', async () => {
    await open(APP_ROUTES.ROLES, TEST_USER);
    expect(
      await screen.findByRole('link', { name: copy.nav.accounts }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: copy.nav.roles })).toBeVisible();
  });

  it('hides Roles when the role cannot read roles', async () => {
    await open(
      APP_ROUTES.ACCOUNTS,
      { ...adminUser, role: 'editor' },
      {
        [`GET ${ACCOUNTS.LIST}`]: () => ({ status: 403 }),
      },
    );
    await screen.findByText(copy.accounts.forbidden);
    expect(
      screen.queryByRole('link', { name: copy.nav.roles }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: copy.nav.accounts }),
    ).not.toBeInTheDocument();
  });
});

describe('RolesPage and RolePermissionsPage', () => {
  it('lists roles and opens one', async () => {
    await open(APP_ROUTES.ROLES, TEST_USER);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('link', { name: copy.roles.open('Editor') }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Editor' }),
    ).toBeInTheDocument();
  });

  it('explains the owner role has nothing to configure', async () => {
    await open(rolePermissionsPath(ownerRole.id), TEST_USER);
    expect(await screen.findByText(copy.role.owner)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.role.save }),
    ).not.toBeInTheDocument();
  });

  it('edits the matrix and saves the whole permission set', async () => {
    let saved: PermissionRow[] = [];
    const { api } = await open(rolePermissionsPath(editorRole.id), TEST_USER, {
      [`PUT ${ROLES.PERMISSIONS(editorRole.id)}`]: (config) => {
        saved = (
          JSON.parse(config.data as string) as { permissions: PermissionRow[] }
        ).permissions;
        return { status: 200, data: { ...editorRole, permissions: saved } };
      },
    });
    const user = userEvent.setup();
    const save = await screen.findByRole('button', { name: copy.role.save });
    expect(save).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', {
        name: copy.matrix.cellLabel('Update', 'article'),
      }),
    );
    expect(screen.getByText(copy.role.unsaved)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: copy.matrix.detailsLabel('article') }),
    );
    const details = await screen.findByRole('group', {
      name: copy.matrix.detailsLabel('article'),
    });
    await user.click(
      within(details).getAllByRole('radio', { name: copy.fields.some }).at(-1)!,
    );
    expect(
      within(details).getByText(copy.fields.sensitive),
    ).toBeInTheDocument();
    await user.click(within(details).getByLabelText('title'));

    await user.click(screen.getByRole('button', { name: copy.role.save }));
    expect(await screen.findByText(copy.role.saved)).toBeInTheDocument();
    expect(api.callsTo(`PUT ${ROLES.PERMISSIONS(editorRole.id)}`)).toHaveLength(
      1,
    );
    expect(saved).toEqual([
      {
        subject: 'article',
        action: 'read',
        readableFields: null,
        writableFields: null,
        conditions: null,
      },
      {
        subject: 'article',
        action: 'update',
        readableFields: null,
        writableFields: ['title'],
        conditions: null,
      },
    ]);
  });

  it('blocks save while conditions are not valid JSON and sends nothing', async () => {
    const { api } = await open(rolePermissionsPath(editorRole.id), TEST_USER);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: copy.role.save });
    await user.click(
      screen.getByRole('button', { name: copy.matrix.detailsLabel('article') }),
    );
    const details = await screen.findByRole('group', {
      name: copy.matrix.detailsLabel('article'),
    });
    await user.click(
      within(details).getByText(copy.conditions.summary('Read')),
    );
    await user.type(
      within(details).getByLabelText(copy.conditions.label('Read')),
      '{{oops',
    );
    await user.click(screen.getByRole('button', { name: copy.role.save }));
    expect(
      await screen.findByText(copy.role.conditionsInvalidJson),
    ).toBeInTheDocument();
    expect(api.callsTo(`PUT ${ROLES.PERMISSIONS(editorRole.id)}`)).toHaveLength(
      0,
    );
  });

  it('marks the rows the server refuses as not held', async () => {
    await open(rolePermissionsPath(editorRole.id), TEST_USER, {
      [`PUT ${ROLES.PERMISSIONS(editorRole.id)}`]: () => ({
        status: 403,
        data: {
          errorCode: 'PERMISSION_NOT_HELD',
          message: 'no',
          details: { indexes: [0] },
        },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('checkbox', {
        name: copy.matrix.cellLabel('Delete', 'article'),
      }),
    );
    await user.click(screen.getByRole('button', { name: copy.role.save }));
    expect(
      await screen.findByText(copy.errors.permissionNotHeld),
    ).toBeInTheDocument();
  });

  it('is read-only for a role the caller cannot manage, and for callers without roles:update', async () => {
    await open(rolePermissionsPath(adminRole.id), adminUser);
    expect(
      await screen.findByText(copy.role.readOnlyNoUpdate),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.role.save }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: copy.matrix.cellLabel('Read', 'article'),
      }),
    ).toBeDisabled();
  });

  it('disables system permissions the caller does not hold', async () => {
    await open(
      rolePermissionsPath(editorRole.id),
      {
        ...adminUser,
        role: 'admin',
      },
      {
        [`GET ${ROLES.LIST}`]: () => ({
          status: 200,
          data: {
            data: [
              {
                ...adminRole,
                permissions: rows(
                  ['roles', 'read'],
                  ['roles', 'update'],
                  ['accounts', 'read'],
                ),
              },
              editorRole,
            ],
          },
        }),
      },
    );
    expect(
      await screen.findByRole('checkbox', {
        name: copy.matrix.cellLabel('Create', 'Accounts'),
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', {
        name: copy.matrix.cellLabel('Read', 'Accounts'),
      }),
    ).toBeEnabled();
  });

  it('says so when the role does not exist', async () => {
    await open(rolePermissionsPath('nope'), TEST_USER);
    expect(await screen.findByText(copy.role.notFound)).toBeInTheDocument();
  });
});

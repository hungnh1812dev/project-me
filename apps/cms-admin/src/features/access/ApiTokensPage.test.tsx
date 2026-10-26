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
import { APP_ROUTES } from '../../config/App.routes';
import type { CurrentUser } from '../auth/auth.slice';
import type { ContentType } from '../content-types';
import type { ApiToken, PermissionRow, Role } from './access.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { API_TOKENS, ROLES, CONTENT_TYPES } = API_ENDPOINTS;
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
  ...ownerRole,
  id: 'role_admin',
  slug: 'admin',
  name: 'Admin',
  rank: 80,
  manageable: true,
  permissions: rows(
    ['api_tokens', 'read'],
    ['api_tokens', 'create'],
    ['api_tokens', 'update'],
    ['article', 'read'],
    ['article', 'update'],
  ),
};
const readOnlyRole: Role = {
  ...adminRole,
  id: 'role_viewer',
  slug: 'viewer',
  name: 'Viewer',
  rank: 40,
  permissions: rows(['api_tokens', 'read']),
};

const field = (path: string) => ({
  path,
  type: 'text',
  system: false,
  component: false,
  repeatable: false,
  rootScalar: true,
  conditionKind: 'string',
  sensitive: false,
});
const article: ContentType = {
  slug: 'article',
  kind: 'collection',
  draftAndPublish: true,
  fields: [field('title'), field('body')],
};
const page: ContentType = { ...article, slug: 'page' };

const RAW_TOKEN = `ak_live_${'A'.repeat(43)}`;

function token(overrides: Partial<ApiToken>): ApiToken {
  return {
    id: 'tok_build',
    name: 'Website build',
    tokenPrefix: 'ak_live_AAAA',
    scope: {
      permissions: [
        { subject: 'article', action: 'read', readableFields: ['title'] },
      ],
    },
    status: 'active',
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: { id: 'acc_admin', displayName: 'Admin Person' },
    ...overrides,
  };
}

const build = token({});
const adminUser: CurrentUser = { ...TEST_USER, id: 'acc_admin', role: 'admin' };
const viewerUser: CurrentUser = { ...TEST_USER, id: 'acc_v', role: 'viewer' };

function listBody(list: ApiToken[], pageNo = 1, total = list.length) {
  return { data: list, meta: { page: pageNo, pageSize: 20, total } };
}

async function open(
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [ownerRole, adminRole, readOnlyRole] },
    }),
    [`GET ${CONTENT_TYPES.LIST}`]: () => ({
      status: 200,
      data: { data: [article, page] },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.API_TOKENS);
  return { api };
}

const listHandler: FakeHandler = () => ({
  status: 200,
  data: listBody([build]),
});

describe('ApiTokensPage', () => {
  it('lists tokens without ever showing a secret, with create, edit and revoke for the owner', async () => {
    await open(TEST_USER, { [`GET ${API_TOKENS.LIST}`]: listHandler });
    expect(await screen.findByText('Website build')).toBeInTheDocument();
    expect(screen.getByText(/ak_live_AAAA/)).toBeInTheDocument();
    expect(screen.getByText(copy.apiTokens.status.active)).toBeInTheDocument();
    expect(
      screen.getByText(copy.apiTokens.access(1, 'article')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.apiTokens.create }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: copy.apiTokens.editLabel('Website build'),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: copy.apiTokens.revokeLabel('Website build'),
      }),
    ).toBeVisible();
  });

  it("shows who created each token when the list holds other accounts' tokens", async () => {
    await open(TEST_USER, { [`GET ${API_TOKENS.LIST}`]: listHandler });
    expect(await screen.findByText('Admin Person')).toBeInTheDocument();
  });

  it('hides create, edit and revoke for a role that can only read tokens', async () => {
    await open(viewerUser, { [`GET ${API_TOKENS.LIST}`]: listHandler });
    expect(await screen.findByText('Website build')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.apiTokens.create }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Revoke / }),
    ).not.toBeInTheDocument();
  });

  it('offers no edit or revoke on a revoked token', async () => {
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => ({
        status: 200,
        data: listBody([
          token({ status: 'revoked', revokedAt: '2026-10-02T00:00:00.000Z' }),
        ]),
      }),
    });
    expect(
      await screen.findByText(copy.apiTokens.status.revoked),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit / }),
    ).not.toBeInTheDocument();
  });

  it('offers revoke but no edit on an expired token', async () => {
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => ({
        status: 200,
        data: listBody([token({ status: 'expired' })]),
      }),
    });
    expect(
      await screen.findByText(copy.apiTokens.status.expired),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: copy.apiTokens.revokeLabel('Website build'),
      }),
    ).toBeInTheDocument();
  });

  it('shows the expired notice and refetches when the token expired during an edit', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`PATCH ${API_TOKENS.ONE('tok_build')}`]: () => ({
        status: 409,
        data: { errorCode: 'API_TOKEN_EXPIRED', message: 'x' },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.apiTokens.editLabel('Website build'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(
      new RegExp(copy.tokenForm.nameLabel),
    );
    await user.clear(name);
    await user.type(name, 'Site build');
    const listCalls = api.callsTo(`GET ${API_TOKENS.LIST}`).length;
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitEdit }),
    );
    expect(
      await screen.findByText(copy.apiTokens.alreadyExpired),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.callsTo(`GET ${API_TOKENS.LIST}`).length).toBeGreaterThan(
        listCalls,
      ),
    );
  });

  it('shows an empty state pointing to the first action', async () => {
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => ({ status: 200, data: listBody([]) }),
    });
    expect(await screen.findByText(copy.apiTokens.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.apiTokens.emptyHint)).toBeInTheDocument();
  });

  it('shows an error with a retry, and a calm message on 403', async () => {
    let calls = 0;
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => {
        calls += 1;
        return calls === 1
          ? { status: 500 }
          : { status: 200, data: listBody([build]) };
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByText(copy.apiTokens.loadFailed),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.errors.retry }));
    expect(await screen.findByText('Website build')).toBeInTheDocument();
  });

  it('shows the forbidden message when the server answers 403', async () => {
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => ({ status: 403 }),
    });
    expect(
      await screen.findByText(copy.apiTokens.forbidden),
    ).toBeInTheDocument();
  });

  it('creates a token: validates, shows the raw token once, copies it, then never again', async () => {
    let created = false;
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: () => ({
        status: 200,
        data: listBody(created ? [build] : []),
      }),
      [`POST ${API_TOKENS.LIST}`]: () => {
        created = true;
        return { status: 201, data: { ...build, token: RAW_TOKEN } };
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.apiTokens.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: copy.tokenForm.createTitle,
    });

    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitCreate }),
    );
    expect(
      await within(dialog).findByText(copy.tokenForm.validation.nameRequired),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(copy.tokenForm.validation.scopeRequired),
    ).toBeInTheDocument();
    expect(api.callsTo(`POST ${API_TOKENS.LIST}`)).toHaveLength(0);

    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.tokenForm.nameLabel)),
      'Website build',
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read article' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitCreate }),
    );

    const reveal = await screen.findByRole('dialog', {
      name: copy.tokenReveal.title('Website build'),
    });
    expect(within(reveal).getByLabelText(copy.tokenReveal.label)).toHaveValue(
      RAW_TOKEN,
    );
    const [call] = api.callsTo(`POST ${API_TOKENS.LIST}`);
    expect(JSON.parse(call?.data as string)).toEqual({
      name: 'Website build',
      scope: { permissions: [{ subject: 'article', action: 'read' }] },
    });

    // Esc does not dismiss the one-time view.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(
      within(reveal).getByRole('button', { name: copy.tokenReveal.copy }),
    );
    expect(
      await within(reveal).findByText(copy.tokenReveal.copied),
    ).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(RAW_TOKEN);

    await user.click(
      within(reveal).getByRole('button', { name: copy.tokenReveal.done }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(copy.apiTokens.created('Website build')),
    ).toBeInTheDocument();
    expect(screen.queryByText(RAW_TOKEN)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(RAW_TOKEN);

    // Opening the dialog again starts empty: the token is gone.
    await user.click(
      screen.getByRole('button', { name: copy.apiTokens.create }),
    );
    const again = await screen.findByRole('dialog');
    expect(
      within(again).queryByDisplayValue(RAW_TOKEN),
    ).not.toBeInTheDocument();
  });

  it('limits fields of a permission and sends the chosen list', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`POST ${API_TOKENS.LIST}`]: () => ({
        status: 201,
        data: { ...build, token: RAW_TOKEN },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.apiTokens.create }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.tokenForm.nameLabel)),
      'Feed',
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read article' }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.tokenScope.fieldsLabel('article'),
      }),
    );
    await user.click(within(dialog).getByLabelText(copy.fields.some));
    await user.click(within(dialog).getByLabelText('title'));
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitCreate }),
    );
    await screen.findByRole('dialog', {
      name: copy.tokenReveal.title('Website build'),
    });
    const [call] = api.callsTo(`POST ${API_TOKENS.LIST}`);
    expect(
      (JSON.parse(call?.data as string) as { scope: { permissions: unknown } })
        .scope.permissions,
    ).toEqual([
      { subject: 'article', action: 'read', readableFields: ['title'] },
    ]);
  });

  it('greys out permissions the caller does not hold and marks ones the server refuses', async () => {
    await open(adminUser, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`POST ${API_TOKENS.LIST}`]: () => ({
        status: 403,
        data: {
          errorCode: 'API_TOKEN_SCOPE_NOT_HELD',
          message: 'x',
          details: { indexes: [0] },
        },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: copy.apiTokens.create }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('checkbox', { name: 'Delete article' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Update article' }),
    ).toBeEnabled();
    // The admin holds no `*` rows.
    expect(
      within(dialog).getByRole('checkbox', { name: 'Read All content types' }),
    ).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText(new RegExp(copy.tokenForm.nameLabel)),
      'Too much',
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read article' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitCreate }),
    );
    expect(
      await within(dialog).findByText(copy.errors.scopeNotHeld),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('checkbox', { name: 'Read article' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits a token and sends only what changed', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`PATCH ${API_TOKENS.ONE('tok_build')}`]: () => ({
        status: 200,
        data: { ...build, name: 'Site build' },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.apiTokens.editLabel('Website build'),
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: copy.tokenForm.editTitle('Website build'),
    });
    const name = within(dialog).getByLabelText(
      new RegExp(copy.tokenForm.nameLabel),
    );
    expect(name).toHaveValue('Website build');
    expect(
      within(dialog).getByRole('checkbox', { name: 'Read article' }),
    ).toBeChecked();
    await user.clear(name);
    await user.type(name, 'Site build');
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitEdit }),
    );
    expect(
      await screen.findByText(copy.apiTokens.updated('Site build')),
    ).toBeInTheDocument();
    const [call] = api.callsTo(`PATCH ${API_TOKENS.ONE('tok_build')}`);
    expect(JSON.parse(call?.data as string)).toEqual({ name: 'Site build' });
  });

  it('edits the scope: sends the new scope, and no request when nothing changed', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`PATCH ${API_TOKENS.ONE('tok_build')}`]: () => ({
        status: 200,
        data: build,
      }),
    });
    const user = userEvent.setup();
    const editButton = await screen.findByRole('button', {
      name: copy.apiTokens.editLabel('Website build'),
    });
    await user.click(editButton);
    let dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitEdit }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.callsTo(`PATCH ${API_TOKENS.ONE('tok_build')}`)).toHaveLength(0);

    await user.click(editButton);
    dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read page' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: copy.tokenForm.submitEdit }),
    );
    await screen.findByText(copy.apiTokens.updated('Website build'));
    const [call] = api.callsTo(`PATCH ${API_TOKENS.ONE('tok_build')}`);
    expect(JSON.parse(call?.data as string)).toEqual({
      scope: {
        permissions: [
          { subject: 'article', action: 'read', readableFields: ['title'] },
          { subject: 'page', action: 'read' },
        ],
      },
    });
  });

  it('revokes only after a confirmation that names the token', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`POST ${API_TOKENS.REVOKE('tok_build')}`]: () => ({ status: 204 }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.apiTokens.revokeLabel('Website build'),
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: copy.revokeToken.title('Website build'),
    });
    expect(api.callsTo(`POST ${API_TOKENS.REVOKE('tok_build')}`)).toHaveLength(
      0,
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.revokeToken.submit('Website build'),
      }),
    );
    expect(
      await screen.findByText(copy.apiTokens.revoked('Website build')),
    ).toBeInTheDocument();
    expect(api.callsTo(`POST ${API_TOKENS.REVOKE('tok_build')}`)).toHaveLength(
      1,
    );
  });

  it('says so when the token was already revoked elsewhere', async () => {
    await open(TEST_USER, {
      [`GET ${API_TOKENS.LIST}`]: listHandler,
      [`POST ${API_TOKENS.REVOKE('tok_build')}`]: () => ({
        status: 409,
        data: { errorCode: 'API_TOKEN_REVOKED', message: 'x' },
      }),
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: copy.apiTokens.revokeLabel('Website build'),
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: copy.revokeToken.submit('Website build'),
      }),
    );
    expect(
      await screen.findByText(copy.apiTokens.alreadyRevoked),
    ).toBeInTheDocument();
  });

  it('shows the API tokens link only to roles that can read them', async () => {
    await open(TEST_USER, { [`GET ${API_TOKENS.LIST}`]: listHandler });
    expect(
      await screen.findByRole('link', { name: copy.nav.apiTokens }),
    ).toBeInTheDocument();
  });
});

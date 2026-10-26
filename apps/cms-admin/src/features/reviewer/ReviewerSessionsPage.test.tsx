import { screen, waitFor } from '@testing-library/react';
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
import type { CurrentUser } from '../auth/Auth.slice';
import type { Role } from '../access/access.api';
import type { ReviewerSession } from './reviewer.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { ROLES, REVIEWER } = API_ENDPOINTS;
const copy = COPY.reviewer;

const adminRole: Role = {
  id: 'role_admin',
  slug: 'admin',
  name: 'Admin',
  rank: 80,
  isSystem: true,
  accountCount: 1,
  manageable: true,
  permissions: [],
};
const roleWith = (slug: string, actions: ('read' | 'update')[]): Role => ({
  ...adminRole,
  id: `role_${slug}`,
  slug,
  permissions: actions.map((action) => ({
    subject: 'reviewer_settings',
    action,
    readableFields: null,
    writableFields: null,
    conditions: null,
  })),
});

function session(overrides: Partial<ReviewerSession> = {}): ReviewerSession {
  return {
    id: 'rev_1',
    visitorRole: 'Recruiter',
    purposeTags: ['Hiring', 'Networking'],
    notes: 'Reading the CV for a role in Hanoi',
    userAgent: 'Mozilla/5.0 (Macintosh)',
    createdAt: '2026-10-22T08:00:00.000Z',
    expiresAt: '2026-10-23T08:00:00.000Z',
    active: true,
    ...overrides,
  };
}

const listOf = (rows: ReviewerSession[]) => ({
  status: 200,
  data: { data: rows, meta: { page: 1, pageSize: 20, total: rows.length } },
});

async function open(
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
  roles: Role[] = [],
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: roles } }),
    [`GET ${REVIEWER.STATUS}`]: () => ({
      status: 200,
      data: { enabled: true },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.REVIEWER_SESSIONS);
  return { api };
}

describe('ReviewerSessionsPage', () => {
  it('lists sessions and shows notes as plain text', async () => {
    const hostile = '<img src=x onerror=alert(1)>hello';
    await open(TEST_USER, {
      [`GET ${REVIEWER.SESSIONS}`]: () =>
        listOf([
          session({ notes: hostile }),
          session({
            id: 'rev_2',
            visitorRole: 'Auditor',
            notes: null,
            active: false,
            purposeTags: [],
          }),
        ]),
    });
    expect(await screen.findByText('Recruiter')).toBeInTheDocument();
    expect(screen.getByText('Hiring, Networking')).toBeInTheDocument();
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(copy.status.active)).toBeInTheDocument();
    expect(screen.getByText(copy.status.ended)).toBeInTheDocument();
    expect(screen.getByText(copy.noNotes)).toBeInTheDocument();
    expect(screen.getByText(copy.noPurposes)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    await open(TEST_USER, { [`GET ${REVIEWER.SESSIONS}`]: () => listOf([]) });
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it('shows a retryable error when the list fails', async () => {
    await open(TEST_USER, {
      [`GET ${REVIEWER.SESSIONS}`]: () => ({ status: 500, data: {} }),
    });
    expect(await screen.findByText(copy.loadFailed)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: COPY.access.errors.retry }),
    ).toBeInTheDocument();
  });

  it('says so when the role may not view the log', async () => {
    await open(TEST_USER, {
      [`GET ${REVIEWER.SESSIONS}`]: () => ({ status: 403, data: {} }),
    });
    expect(await screen.findByText(copy.forbidden)).toBeInTheDocument();
  });

  it('asks before switching off, then ends sessions', async () => {
    const put = vi.fn<FakeHandler>(() => ({
      status: 200,
      data: { enabled: false },
    }));
    const user = userEvent.setup();
    await open(TEST_USER, {
      [`GET ${REVIEWER.SESSIONS}`]: () => listOf([session()]),
      [`PUT ${REVIEWER.SETTINGS}`]: put,
    });
    const toggle = await screen.findByRole('switch', {
      name: copy.switch.label,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(put).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole('button', { name: copy.confirmOff.submit }),
    );
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: copy.switch.label }),
      ).not.toBeChecked(),
    );
  });

  it('switches on without a prompt', async () => {
    const put = vi.fn<FakeHandler>(() => ({
      status: 200,
      data: { enabled: true },
    }));
    const user = userEvent.setup();
    await open(TEST_USER, {
      [`GET ${REVIEWER.STATUS}`]: () => ({
        status: 200,
        data: { enabled: false },
      }),
      [`GET ${REVIEWER.SESSIONS}`]: () => listOf([]),
      [`PUT ${REVIEWER.SETTINGS}`]: put,
    });
    await user.click(
      await screen.findByRole('switch', { name: copy.switch.label }),
    );
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  });

  it('keeps the switch read-only for a role that can only read', async () => {
    const viewer: CurrentUser = { ...TEST_USER, id: 'acc_v', role: 'auditor' };
    await open(
      viewer,
      { [`GET ${REVIEWER.SESSIONS}`]: () => listOf([session()]) },
      [roleWith('auditor', ['read'])],
    );
    expect(
      await screen.findByRole('switch', { name: copy.switch.label }),
    ).toBeDisabled();
  });

  it('reports a failed change and leaves the switch as it was', async () => {
    const user = userEvent.setup();
    await open(TEST_USER, {
      [`GET ${REVIEWER.STATUS}`]: () => ({
        status: 200,
        data: { enabled: false },
      }),
      [`GET ${REVIEWER.SESSIONS}`]: () => listOf([]),
      [`PUT ${REVIEWER.SETTINGS}`]: () => ({ status: 500, data: {} }),
    });
    const toggle = await screen.findByRole('switch', {
      name: copy.switch.label,
    });
    await user.click(toggle);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });
});

describe('reviewer mode in the shell', () => {
  const reviewer: CurrentUser = {
    ...TEST_USER,
    id: 'acc_rev',
    displayName: 'Reviewer',
    role: 'reviewer',
  };

  it('shows the read-only banner and no security link or reviewer nav', async () => {
    await open(reviewer, {
      [`GET ${ROLES.LIST}`]: () => ({ status: 403, data: {} }),
    });
    expect(await screen.findByText(copy.banner.message)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: COPY.session.securityLink }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: COPY.access.nav.reviewer }),
    ).not.toBeInTheDocument();
  });

  it('does not show the banner to an owner', async () => {
    await open(TEST_USER, { [`GET ${REVIEWER.SESSIONS}`]: () => listOf([]) });
    await screen.findByText(copy.empty);
    expect(screen.queryByText(copy.banner.message)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: COPY.access.nav.reviewer }),
    ).toBeInTheDocument();
  });
});

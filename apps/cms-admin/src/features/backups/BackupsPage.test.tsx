import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/RenderApp.fixture';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { APP_ROUTES } from '../../config/App.routes';
import { COPY } from '../../config/Copy.constants';
import type { Role } from '../access/Access.api';
import type { CurrentUser } from '../auth/Auth.slice';
import type { BackupFile, BackupsList } from './Backups.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { BACKUPS, ROLES } = API_ENDPOINTS;
const copy = COPY.backups;
const RETRY_WAIT_MS = 4_000;
const RETRY_BACKOFF_MS = 1_500;

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
const admin: CurrentUser = { ...TEST_USER, id: 'acc_a', role: 'admin' };

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    key: 'postgres/daily/abyss-20261027T020000Z.dump.age',
    kind: 'daily',
    fileName: 'abyss-20261027T020000Z.dump.age',
    createdAt: '2026-10-27T02:00:00.000Z',
    sizeBytes: 193_273_528,
    ...overrides,
  };
}

function listOf(
  rows: BackupFile[],
  meta: Partial<BackupsList['meta']> = {},
): { status: number; data: BackupsList } {
  return {
    status: 200,
    data: {
      data: rows,
      meta: {
        count: rows.length,
        totalBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
        latestAt: rows[0]?.createdAt ?? null,
        isStale: false,
        ...meta,
      },
    },
  };
}

async function openAndCheck(
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
) {
  const opened = await open(user, handlers);
  await userEvent.click(
    await screen.findByRole('button', { name: copy.check.button }),
  );
  return opened;
}

async function open(
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
  route: string = APP_ROUTES.BACKUPS,
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [adminRole] },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, route);
  return { api };
}

const notConfigured: FakeHandler = () => ({
  status: 404,
  data: { errorCode: 'BACKUPS_NOT_CONFIGURED' },
});

describe('BackupsPage', () => {
  it('does not load on open; the button fetches once', async () => {
    const { api } = await open(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () => listOf([backup()]),
    });
    await screen.findByRole('button', { name: copy.check.button });
    expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('button', { name: copy.check.button }),
    );
    await screen.findByRole('table', { name: copy.tableLabel });
    expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', { name: copy.check.refresh }),
    );
    await vi.waitFor(() =>
      expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(2),
    );
  });

  it('lists backups newest first with size and the stale banner', async () => {
    await openAndCheck(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () =>
        listOf(
          [
            backup(),
            backup({
              key: 'postgres/monthly/abyss-20261001T020000Z.dump.age',
              kind: 'monthly',
              fileName: 'abyss-20261001T020000Z.dump.age',
              createdAt: '2026-10-01T02:00:00.000Z',
              sizeBytes: 512,
            }),
          ],
          { isStale: true },
        ),
    });
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Daily')).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText('184.3 MiB')).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText('Monthly')).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText('512 B')).toBeVisible();
    expect(screen.getByText(copy.stale)).toBeVisible();
    expect(screen.getByText(copy.encryptedNote)).toBeVisible();
    expect(screen.getByText(/^2 backups/)).toBeVisible();
    expect(within(table).getAllByRole('time')[0]?.getAttribute('title')).toBe(
      copy.utc('2026-10-27 02:00'),
    );
  });

  it('shows no stale banner when the newest daily backup is fresh', async () => {
    await openAndCheck(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () => listOf([backup()]),
    });
    await screen.findByRole('table', { name: copy.tableLabel });
    expect(screen.queryByText(copy.stale)).toBeNull();
  });

  it('shows an empty state', async () => {
    await openAndCheck(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () => listOf([]),
    });
    expect(await screen.findByText(copy.empty)).toBeVisible();
  });

  it('shows the not-configured state without an error alert', async () => {
    await openAndCheck(TEST_USER, { [`GET ${BACKUPS.LIST}`]: notConfigured });
    expect(await screen.findByText(copy.notConfigured.title)).toBeVisible();
    expect(screen.queryByText(copy.loadFailed)).toBeNull();
  });

  it('shows a retryable error when the list fails', async () => {
    await openAndCheck(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () => ({ status: 500, data: {} }),
    });
    // A 5xx is retried once (one second back-off) before the error shows.
    expect(
      await screen.findByText(copy.loadFailed, {}, { timeout: RETRY_WAIT_MS }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: COPY.common.retry }),
    ).toBeVisible();
  });

  it('shows a rate-limit message with retry on a 429, without a second request', async () => {
    const { api } = await openAndCheck(TEST_USER, {
      [`GET ${BACKUPS.LIST}`]: () => ({
        status: 429,
        data: { errorCode: 'TOO_MANY_REQUESTS' },
        headers: { 'retry-after': '16' },
      }),
    });
    expect(await screen.findByText(copy.rateLimited)).toBeVisible();
    expect(screen.queryByText(copy.loadFailed)).toBeNull();
    expect(
      screen.getByRole('button', { name: COPY.common.retry }),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(1);
  });

  it('shows the forbidden state to a non-owner without a request', async () => {
    const { api } = await open(admin, {
      [`GET ${BACKUPS.LIST}`]: () => listOf([backup()]),
    });
    expect(await screen.findByText(copy.forbidden)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(0);
  });
});

describe('Backups nav item', () => {
  it('shows for the owner without any request', async () => {
    const { api } = await open(TEST_USER, {}, APP_ROUTES.HOME);
    expect(await screen.findByRole('link', { name: copy.nav })).toHaveAttribute(
      'href',
      APP_ROUTES.BACKUPS,
    );
    expect(api.callsTo(`GET ${BACKUPS.LIST}`)).toHaveLength(0);
  });

  it('is hidden for an admin', async () => {
    await open(admin, {}, APP_ROUTES.HOME);
    await screen.findByRole('navigation', { name: COPY.access.nav.label });
    expect(screen.queryByRole('link', { name: copy.nav })).toBeNull();
  });
});

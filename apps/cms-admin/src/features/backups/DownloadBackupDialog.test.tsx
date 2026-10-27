import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/RenderApp.fixture';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { APP_ROUTES } from '../../config/App.routes';
import { COPY } from '../../config/Copy.constants';
import type { CurrentUser } from '../auth/Auth.slice';
import type { BackupFile } from './Backups.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { BACKUPS } = API_ENDPOINTS;
const copy = COPY.backups;
const PASSWORD = 'correct horse battery staple';
const LINK_URL = 'https://bucket.example.test/abyss.dump.age?sig=abc';

const file: BackupFile = {
  key: 'postgres/daily/abyss-20261027T020000Z.dump.age',
  kind: 'daily',
  fileName: 'abyss-20261027T020000Z.dump.age',
  createdAt: '2026-10-27T02:00:00.000Z',
  sizeBytes: 1_048_576,
};
const totpOwner: CurrentUser = {
  ...TEST_USER,
  twoFactorEnabled: true,
  twoFactorMethod: 'totp',
};

const assign = vi.fn<(url: string) => void>();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

async function openDialog(
  user: CurrentUser,
  handlers: Record<string, FakeHandler> = {},
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${BACKUPS.LIST}`]: () => ({
      status: 200,
      data: {
        data: [file],
        meta: {
          count: 1,
          totalBytes: file.sizeBytes,
          latestAt: file.createdAt,
          isStale: false,
        },
      },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.BACKUPS);
  await userEvent.click(
    await screen.findByRole('button', {
      name: copy.download.buttonLabel(file.fileName),
    }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: copy.dialog.title(file.fileName),
  });
  return { api, dialog };
}

async function fillAndSubmit(dialog: HTMLElement, code: string) {
  await userEvent.type(
    within(dialog).getByLabelText(/^Authenticator code/),
    code,
  );
  await userEvent.type(
    within(dialog).getByLabelText(/^Current password/),
    `${PASSWORD}{Enter}`,
  );
}

describe('DownloadBackupDialog', () => {
  it('posts key, password and code, then goes to the returned link and closes', async () => {
    const { api, dialog } = await openDialog(totpOwner, {
      [`POST ${BACKUPS.DOWNLOAD_LINKS}`]: () => ({
        status: 201,
        data: { url: LINK_URL, fileName: file.fileName, expiresAt: 'x' },
      }),
    });
    await fillAndSubmit(dialog, '123456');
    await waitFor(() => expect(assign).toHaveBeenCalledWith(LINK_URL));
    expect(api.callsTo(`POST ${BACKUPS.DOWNLOAD_LINKS}`)[0]?.data).toBe(
      JSON.stringify({ key: file.key, code: '123456', password: PASSWORD }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('marks the code field when the code is wrong and does not navigate', async () => {
    const { dialog } = await openDialog(totpOwner, {
      [`POST ${BACKUPS.DOWNLOAD_LINKS}`]: () => ({
        status: 403,
        data: { errorCode: 'AUTH_INVALID_2FA_CODE' },
      }),
    });
    await fillAndSubmit(dialog, '123456');
    expect(
      await within(dialog).findByText(COPY.security.errors.invalidCode),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it('marks the password field when the password is wrong', async () => {
    const { dialog } = await openDialog(totpOwner, {
      [`POST ${BACKUPS.DOWNLOAD_LINKS}`]: () => ({
        status: 403,
        data: { errorCode: 'AUTH_INVALID_CREDENTIALS' },
      }),
    });
    await fillAndSubmit(dialog, '123456');
    expect(
      await within(dialog).findByText(COPY.security.errors.wrongPassword),
    ).toBeVisible();
  });

  it('points to the security settings when 2FA is off', async () => {
    const { dialog } = await openDialog(TEST_USER);
    expect(within(dialog).getByText(copy.dialog.twoFactorOff)).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: copy.dialog.openSecurity }),
    ).toHaveAttribute('href', APP_ROUTES.SECURITY_SETTINGS);
    expect(within(dialog).queryByLabelText(/^Current password/)).toBeNull();
  });

  it('switches to the security pointer when the server says 2FA is off', async () => {
    const { dialog } = await openDialog(totpOwner, {
      [`POST ${BACKUPS.DOWNLOAD_LINKS}`]: () => ({
        status: 403,
        data: { errorCode: 'AUTH_2FA_NOT_ENABLED' },
      }),
    });
    await fillAndSubmit(dialog, '123456');
    expect(
      await within(dialog).findByText(copy.dialog.twoFactorOff),
    ).toBeVisible();
  });

  it('shows the rate-limit message on 429', async () => {
    const { dialog } = await openDialog(totpOwner, {
      [`POST ${BACKUPS.DOWNLOAD_LINKS}`]: () => ({
        status: 429,
        data: {},
        headers: { 'retry-after': '120' },
      }),
    });
    await fillAndSubmit(dialog, '123456');
    expect(
      await within(dialog).findByText(
        COPY.password.errors.rateLimitedMinutes(2),
      ),
    ).toBeVisible();
  });

  it('sends an email code on open for the email method', async () => {
    const emailOwner: CurrentUser = { ...totpOwner, twoFactorMethod: 'email' };
    const send = vi.fn<FakeHandler>(() => ({ status: 202 }));
    await openDialog(emailOwner, {
      [`POST ${API_ENDPOINTS.TWO_FACTOR.EMAIL_SEND_CODE}`]: send,
    });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(copy.dialog.emailCodeSent)).toBeVisible();
  });
});

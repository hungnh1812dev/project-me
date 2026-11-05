import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { CurrentUser } from '@features/auth/Auth.slice';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { TOTP_SETUP, ENABLE, DISABLE, EMAIL_SEND_CODE } = API_ENDPOINTS.TWO_FACTOR;
const copy = EN_TEXT.security;
const PASSWORD = 'correct horse battery staple';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

async function openSecurity(users: CurrentUser[], handlers: Record<string, FakeHandler> = {}) {
  let meCalls = 0;
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => {
      const user = users[Math.min(meCalls, users.length - 1)];
      meCalls += 1;
      return { status: 200, data: user };
    },
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.SECURITY_SETTINGS);
  await screen.findByRole('heading', { level: 1, name: copy.title });
  return { api, services };
}

const totpUser: CurrentUser = {
  ...TEST_USER,
  twoFactorEnabled: true,
  twoFactorMethod: 'totp',
};
const emailUser: CurrentUser = {
  ...TEST_USER,
  twoFactorEnabled: true,
  twoFactorMethod: 'email',
};

describe('SecuritySettingsPage', () => {
  it('is linked from the user menu and shows 2FA off', async () => {
    await openSecurity([TEST_USER]);
    await userEvent.click(
      screen.getByRole('button', { name: EN_TEXT.session.accountMenu(TEST_USER.displayName) }),
    );
    expect(screen.getByRole('menuitem', { name: EN_TEXT.session.securityLink })).toHaveAttribute(
      'href',
      APP_ROUTES.SECURITY_SETTINGS,
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(copy.twoFactor.statusOff)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.twoFactor.setUpTotp })).toBeInTheDocument();
  });

  it('sets up TOTP: shows the key, enables with code + password, reloads the user', async () => {
    const { api } = await openSecurity([TEST_USER, totpUser], {
      [`POST ${TOTP_SETUP}`]: () => ({
        status: 200,
        data: {
          otpauthUri: `otpauth://totp/x?secret=${SECRET}`,
          secret: SECRET,
        },
      }),
      [`POST ${ENABLE}`]: () => ({ status: 204 }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.setUpTotp }));
    const dialog = await screen.findByRole('dialog', {
      name: copy.totpSetup.title,
    });
    expect(await within(dialog).findByTestId('totp-secret')).toHaveTextContent(
      'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
    );
    expect(within(dialog).getByTitle(copy.totpSetup.qrLabel)).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(`^${copy.fields.totpCode}`)),
      '123456',
    );
    await userEvent.type(within(dialog).getByLabelText(/^Current password/), `${PASSWORD}{Enter}`);

    expect(await screen.findByText(copy.twoFactor.enabledTotp)).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(copy.twoFactor.statusTotp)).toBeInTheDocument();
    expect(api.callsTo(`POST ${ENABLE}`)[0]?.data).toBe(
      JSON.stringify({ method: 'totp', code: '123456', password: PASSWORD }),
    );
  });

  it('keeps the TOTP setup open on an overlay click and drops the secret on Esc', async () => {
    await openSecurity([TEST_USER], {
      [`POST ${TOTP_SETUP}`]: () => ({
        status: 200,
        data: { otpauthUri: 'otpauth://totp/x', secret: SECRET },
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.setUpTotp }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('totp-secret');

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay as Element);
    expect(screen.getByTestId('totp-secret')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('totp-secret')).toBeNull();
  });

  it('marks a wrong password (403) without ending the session', async () => {
    const { api, services } = await openSecurity([TEST_USER], {
      [`POST ${TOTP_SETUP}`]: () => ({
        status: 200,
        data: { otpauthUri: 'otpauth://totp/x', secret: SECRET },
      }),
      [`POST ${ENABLE}`]: () => ({
        status: 403,
        data: { errorCode: 'AUTH_INVALID_CREDENTIALS' },
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.setUpTotp }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('totp-secret');
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(`^${copy.fields.totpCode}`)),
      '123456',
    );
    const password = within(dialog).getByLabelText(/^Current password/);
    await userEvent.type(password, 'wrong password{Enter}');

    expect(await within(dialog).findByText(copy.errors.wrongPassword)).toBeVisible();
    expect(password).toHaveFocus();
    expect(api.callsTo(`POST ${REFRESH}`)).toHaveLength(1);
    expect(services.store.getState().auth.status).toBe('authenticated');
  });

  it('keeps the turn-off dialog and its code field after an Esc and a reopen', async () => {
    await openSecurity([totpUser]);
    const turnOff = () => screen.getByRole('button', { name: copy.twoFactor.turnOff });
    await userEvent.click(turnOff());
    await screen.findByRole('dialog', { name: copy.disable.title });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(turnOff());
    const dialog = await screen.findByRole('dialog', { name: copy.disable.title });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole('dialog', { name: copy.disable.title })).toBe(dialog);
    expect(
      within(dialog).getByLabelText(new RegExp(`^${copy.fields.totpCode}`)),
    ).toBeInTheDocument();
  });

  it('warns about email 2FA and turns it off with an emailed code', async () => {
    const { api } = await openSecurity([emailUser, TEST_USER], {
      [`POST ${EMAIL_SEND_CODE}`]: () => ({ status: 202 }),
      [`POST ${DISABLE}`]: () => ({ status: 204 }),
    });
    expect(screen.getByText(copy.twoFactor.emailWarning)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.turnOff }));
    const dialog = await screen.findByRole('dialog', {
      name: copy.disable.title,
    });
    await waitFor(() => expect(api.callsTo(`POST ${EMAIL_SEND_CODE}`)).toHaveLength(1));
    await userEvent.type(within(dialog).getByLabelText(/^Email code/), '654321');
    await userEvent.type(within(dialog).getByLabelText(/^Current password/), PASSWORD);
    await userEvent.click(within(dialog).getByRole('button', { name: copy.disable.submit }));
    expect(await screen.findByText(copy.twoFactor.disabled)).toBeVisible();
    expect(screen.getByText(copy.twoFactor.statusOff)).toBeInTheDocument();
  });

  it('turns on email 2FA with the first emailed code', async () => {
    const { api } = await openSecurity([TEST_USER, emailUser], {
      [`POST ${EMAIL_SEND_CODE}`]: () => ({ status: 202 }),
      [`POST ${ENABLE}`]: () => ({ status: 204 }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.emailInstead }));
    const dialog = await screen.findByRole('dialog', {
      name: copy.emailSetup.title,
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(copy.twoFactor.emailWarning);
    await userEvent.type(within(dialog).getByLabelText(/^Email code/), '111222');
    await userEvent.type(within(dialog).getByLabelText(/^Current password/), `${PASSWORD}{Enter}`);
    expect(await screen.findByText(copy.twoFactor.enabledEmail)).toBeVisible();
    expect(api.callsTo(`POST ${EMAIL_SEND_CODE}`)).toHaveLength(1);
  });

  it('closes and reloads when 2FA changed elsewhere (409)', async () => {
    await openSecurity([TEST_USER, totpUser], {
      [`POST ${TOTP_SETUP}`]: () => ({
        status: 409,
        data: { errorCode: 'AUTH_2FA_ALREADY_ENABLED' },
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy.twoFactor.setUpTotp }));
    expect(await screen.findByText(copy.errors.stateChanged)).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(copy.twoFactor.statusTotp)).toBeInTheDocument();
  });

  it('no longer holds the change-password form', async () => {
    await openSecurity([TEST_USER]);
    expect(screen.queryByLabelText(/^New password/)).toBeNull();
  });
});

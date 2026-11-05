import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CHANGE } = API_ENDPOINTS.PASSWORD;
const copy = EN_TEXT.security;
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase 42';

async function openChangePassword(handlers: Record<string, FakeHandler> = {}) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.CHANGE_PASSWORD);
  await screen.findByRole('heading', { level: 1, name: copy.changePassword.pageTitle });
  return { api, services };
}

describe('ChangePasswordPage', () => {
  async function fillChange(current: string) {
    await userEvent.type(screen.getByLabelText(/^Current password/), current);
    await userEvent.type(screen.getByLabelText(/^New password/), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), NEW_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: copy.changePassword.submit }));
  }

  it('signs out to the login page with a notice after a change', async () => {
    const { api, services } = await openChangePassword({
      [`POST ${CHANGE}`]: () => ({ status: 204 }),
    });
    await fillChange(PASSWORD);
    expect(await screen.findByText(EN_TEXT.login.notices.passwordChanged)).toBeVisible();
    expect(services.store.getState().auth).toMatchObject({
      status: 'anonymous',
      accessToken: null,
    });
    expect(api.callsTo(`POST ${CHANGE}`)[0]?.data).toBe(
      JSON.stringify({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    );
  });

  it('marks a wrong current password and stays signed in', async () => {
    const { api, services } = await openChangePassword({
      [`POST ${CHANGE}`]: () => ({
        status: 403,
        data: { errorCode: 'AUTH_INVALID_CREDENTIALS' },
      }),
    });
    await fillChange('not my password');
    expect(await screen.findByText(copy.errors.wrongPassword)).toBeVisible();
    expect(screen.getByLabelText(/^Current password/)).toHaveFocus();
    expect(services.store.getState().auth.status).toBe('authenticated');
    expect(api.callsTo(`POST ${REFRESH}`)).toHaveLength(1);
  });

  it('checks that the new passwords match before calling the API', async () => {
    const { api } = await openChangePassword();
    await userEvent.type(screen.getByLabelText(/^Current password/), PASSWORD);
    await userEvent.type(screen.getByLabelText(/^New password/), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), `${NEW_PASSWORD}x`);
    await userEvent.click(screen.getByRole('button', { name: copy.changePassword.submit }));
    expect(await screen.findByText(EN_TEXT.password.validation.passwordsDiffer)).toBeVisible();
    expect(api.callsTo(`POST ${CHANGE}`)).toHaveLength(0);
  });
});

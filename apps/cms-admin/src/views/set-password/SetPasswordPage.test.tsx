import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { API_ERROR_CODES } from '@configs/Http.constants';
import { EN_TEXT } from '@configs/locales/en';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH } = API_ENDPOINTS.AUTH;
const { REQUEST_OTP, SET } = API_ENDPOINTS.PASSWORD;
const EMAIL = 'invited@domain.localhost';
const CODE = '913204';
const NEW_PASSWORD = 'my first passphrase here';

async function openSet(handlers: Record<string, FakeHandler>) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 401 }),
    [`POST ${REQUEST_OTP}`]: () => ({ status: 202 }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.SET_PASSWORD);
  return { api };
}

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));

async function fillAndSubmit() {
  await userEvent.type(field(EN_TEXT.password.emailLabel), EMAIL);
  await userEvent.type(field(EN_TEXT.password.codeLabel), CODE);
  await userEvent.type(field(EN_TEXT.password.newPasswordLabel), NEW_PASSWORD);
  await userEvent.type(field(EN_TEXT.password.confirmPasswordLabel), NEW_PASSWORD);
  await userEvent.click(screen.getByRole('button', { name: EN_TEXT.password.set.submit }));
}

describe('SetPasswordPage', () => {
  it('sets the password and returns to sign in with a notice', async () => {
    const { api } = await openSet({ [`POST ${SET}`]: () => ({ status: 204 }) });
    expect(
      screen.getByRole('heading', { level: 1, name: EN_TEXT.password.set.title }),
    ).toBeInTheDocument();
    await fillAndSubmit();

    expect(
      await screen.findByRole('heading', { level: 1, name: EN_TEXT.login.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(EN_TEXT.login.notices.passwordSet);
    expect(JSON.parse(String(api.callsTo(`POST ${SET}`)[0]?.data))).toEqual({
      email: EMAIL,
      code: CODE,
      newPassword: NEW_PASSWORD,
    });
  });

  it('shows a wrong-code error and keeps the form filled', async () => {
    await openSet({
      [`POST ${SET}`]: () => ({
        status: 400,
        data: { errorCode: API_ERROR_CODES.INVALID_OTP },
      }),
    });
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(EN_TEXT.password.errors.invalidCode);
    expect(field(EN_TEXT.password.emailLabel)).toHaveValue(EMAIL);
  });

  it('needs a valid email before sending a new code', async () => {
    const { api } = await openSet({});
    const resend = screen.getByRole('button', {
      name: EN_TEXT.password.resendCode,
    });
    await userEvent.click(resend);
    expect(field(EN_TEXT.password.emailLabel)).toHaveFocus();
    expect(api.callsTo(`POST ${REQUEST_OTP}`)).toHaveLength(0);

    await userEvent.type(field(EN_TEXT.password.emailLabel), EMAIL);
    await userEvent.click(resend);
    expect(await screen.findByText(EN_TEXT.password.codeResent(EMAIL))).toBeVisible();
    expect(field(EN_TEXT.password.codeLabel)).toHaveFocus();
  });
});

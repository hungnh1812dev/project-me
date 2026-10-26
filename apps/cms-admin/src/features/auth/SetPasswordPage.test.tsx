import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import { createTestServices, renderApp } from '../../../test/RenderApp.fixture';
import { COPY } from '../../config/Copy.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { API_ERROR_CODES } from '../../config/Http.constants';
import { APP_ROUTES } from '../../config/App.routes';

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
  await userEvent.type(field(COPY.password.emailLabel), EMAIL);
  await userEvent.type(field(COPY.password.codeLabel), CODE);
  await userEvent.type(field(COPY.password.newPasswordLabel), NEW_PASSWORD);
  await userEvent.type(field(COPY.password.confirmPasswordLabel), NEW_PASSWORD);
  await userEvent.click(
    screen.getByRole('button', { name: COPY.password.set.submit }),
  );
}

describe('SetPasswordPage', () => {
  it('sets the password and returns to sign in with a notice', async () => {
    const { api } = await openSet({ [`POST ${SET}`]: () => ({ status: 204 }) });
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.password.set.title }),
    ).toBeInTheDocument();
    await fillAndSubmit();

    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.login.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      COPY.login.notices.passwordSet,
    );
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.password.errors.invalidCode,
    );
    expect(field(COPY.password.emailLabel)).toHaveValue(EMAIL);
  });

  it('needs a valid email before sending a new code', async () => {
    const { api } = await openSet({});
    const resend = screen.getByRole('button', {
      name: COPY.password.resendCode,
    });
    await userEvent.click(resend);
    expect(field(COPY.password.emailLabel)).toHaveFocus();
    expect(api.callsTo(`POST ${REQUEST_OTP}`)).toHaveLength(0);

    await userEvent.type(field(COPY.password.emailLabel), EMAIL);
    await userEvent.click(resend);
    expect(
      await screen.findByText(COPY.password.codeResent(EMAIL)),
    ).toBeVisible();
    expect(field(COPY.password.codeLabel)).toHaveFocus();
  });
});

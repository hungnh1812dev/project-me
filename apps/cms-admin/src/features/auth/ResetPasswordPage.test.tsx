import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import { createTestServices, renderApp } from '../../../test/RenderApp.fixture';
import { COPY } from '../../config/Copy.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { API_ERROR_CODES } from '../../config/Http.constants';
import { APP_ROUTES } from '../../config/App.routes';

const { REFRESH } = API_ENDPOINTS.AUTH;
const { REQUEST_OTP, RESET } = API_ENDPOINTS.PASSWORD;
const EMAIL = 'editor@domain.localhost';
const CODE = '042137';
const NEW_PASSWORD = 'a brand new passphrase 42';

async function openReset(handlers: Record<string, FakeHandler>) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 401 }),
    [`POST ${REQUEST_OTP}`]: () => ({ status: 202 }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.RESET_PASSWORD);
  return { api };
}

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));

async function requestCodeFor(email = EMAIL) {
  await userEvent.type(field(COPY.password.emailLabel), email);
  await userEvent.click(
    screen.getByRole('button', { name: COPY.password.reset.sendCode }),
  );
  return screen.findByRole('heading', {
    level: 1,
    name: COPY.password.reset.title,
  });
}

async function fillNewPassword(code = CODE, confirm = NEW_PASSWORD) {
  await userEvent.type(field(COPY.password.codeLabel), code);
  await userEvent.type(field(COPY.password.newPasswordLabel), NEW_PASSWORD);
  await userEvent.type(field(COPY.password.confirmPasswordLabel), confirm);
  await userEvent.click(
    screen.getByRole('button', { name: COPY.password.reset.submit }),
  );
}

function bodyOf(call: { data?: unknown } | undefined): unknown {
  return JSON.parse(String(call?.data)) as unknown;
}

describe('ResetPasswordPage', () => {
  it('validates the email, then asks for a code and moves to the next step', async () => {
    const { api } = await openReset({});
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.sendCode }),
    );
    expect(field(COPY.password.emailLabel)).toHaveAccessibleDescription(
      COPY.password.validation.emailRequired,
    );
    expect(api.callsTo(`POST ${REQUEST_OTP}`)).toHaveLength(0);

    const heading = await requestCodeFor();
    expect(heading).toHaveFocus();
    expect(screen.getByText(COPY.password.reset.codeSent(EMAIL))).toBeVisible();
    expect(bodyOf(api.callsTo(`POST ${REQUEST_OTP}`)[0])).toEqual({
      email: EMAIL,
    });
  });

  it('checks code shape, password length and confirmation before sending', async () => {
    const { api } = await openReset({});
    await requestCodeFor();
    await userEvent.type(field(COPY.password.codeLabel), '12ab');
    await userEvent.type(field(COPY.password.newPasswordLabel), 'short');
    await userEvent.type(
      field(COPY.password.confirmPasswordLabel),
      'different',
    );
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.submit }),
    );

    expect(field(COPY.password.codeLabel)).toHaveAccessibleDescription(
      expect.stringContaining(COPY.password.validation.codeInvalid) as string,
    );
    expect(field(COPY.password.newPasswordLabel)).toHaveAccessibleDescription(
      expect.stringContaining(
        COPY.password.validation.passwordTooShort,
      ) as string,
    );
    expect(
      field(COPY.password.confirmPasswordLabel),
    ).toHaveAccessibleDescription(COPY.password.validation.passwordsDiffer);
    expect(api.callsTo(`POST ${RESET}`)).toHaveLength(0);
  });

  it('resets the password and returns to sign in with a success notice', async () => {
    const { api } = await openReset({
      [`POST ${RESET}`]: () => ({ status: 204 }),
    });
    await requestCodeFor();
    await fillNewPassword();

    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.login.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      COPY.login.notices.passwordReset,
    );
    expect(bodyOf(api.callsTo(`POST ${RESET}`)[0])).toEqual({
      email: EMAIL,
      code: CODE,
      newPassword: NEW_PASSWORD,
    });
  });

  it('explains a wrong or expired code and keeps what was typed', async () => {
    await openReset({
      [`POST ${RESET}`]: () => ({
        status: 400,
        data: { errorCode: API_ERROR_CODES.INVALID_OTP },
      }),
    });
    await requestCodeFor();
    await fillNewPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.password.errors.invalidCode,
    );
    expect(field(COPY.password.codeLabel)).toHaveFocus();
    expect(field(COPY.password.newPasswordLabel)).toHaveValue(NEW_PASSWORD);
  });

  it('asks for the authenticator code when the account uses TOTP', async () => {
    let calls = 0;
    const { api } = await openReset({
      [`POST ${RESET}`]: () => {
        calls += 1;
        return calls === 1
          ? {
              status: 400,
              data: { errorCode: API_ERROR_CODES.TOTP_REQUIRED },
            }
          : { status: 204 };
      },
    });
    await requestCodeFor();
    await fillNewPassword();

    const totp = await screen.findByLabelText(
      new RegExp(`^${COPY.password.totpLabel}`),
    );
    expect(totp).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      COPY.password.errors.totpRequired,
    );
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.submit }),
    );
    expect(totp).toHaveAccessibleDescription(
      expect.stringContaining(COPY.password.validation.totpInvalid) as string,
    );

    await userEvent.type(totp, '654321');
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.submit }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.login.title }),
    ).toBeInTheDocument();
    expect(bodyOf(api.callsTo(`POST ${RESET}`)[1])).toEqual({
      email: EMAIL,
      code: CODE,
      newPassword: NEW_PASSWORD,
      totpCode: '654321',
    });
  });

  it('sends a new code on request', async () => {
    const { api } = await openReset({});
    await requestCodeFor();
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.resendCode }),
    );
    expect(
      await screen.findByText(COPY.password.codeResent(EMAIL)),
    ).toBeVisible();
    expect(api.callsTo(`POST ${REQUEST_OTP}`)).toHaveLength(2);
  });

  it('tells a rate-limited user how long to wait', async () => {
    await openReset({
      [`POST ${REQUEST_OTP}`]: () => ({
        status: 429,
        headers: { 'retry-after': '120' },
      }),
    });
    await userEvent.type(field(COPY.password.emailLabel), EMAIL);
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.sendCode }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.password.errors.rateLimitedMinutes(2),
    );
  });

  it('goes back to the email step', async () => {
    await openReset({});
    await requestCodeFor();
    await userEvent.click(
      screen.getByRole('button', { name: COPY.password.reset.otherEmail }),
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: COPY.password.reset.requestTitle,
      }),
    ).toBeInTheDocument();
  });
});

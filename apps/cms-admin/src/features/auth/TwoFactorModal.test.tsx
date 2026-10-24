import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/render-app';
import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { APP_ROUTES } from '../../config/routes';

const { LOGIN, REFRESH, ME } = API_ENDPOINTS.AUTH;
const { VERIFY, EMAIL_CHALLENGE } = API_ENDPOINTS.TWO_FACTOR;
const copy = COPY.login.twoFactor;
const TEMP = 'temp-token';

async function openChallenge(
  method: string,
  handlers: Record<string, FakeHandler> = {},
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 401 }),
    [`POST ${LOGIN}`]: () => ({
      status: 200,
      data: { requires2FA: true, tempToken: TEMP, methods: [method] },
    }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.LOGIN);
  await userEvent.type(screen.getByLabelText(/^Email/), TEST_USER.email);
  await userEvent.type(screen.getByLabelText(/^Password/), 'pw-123456789');
  await userEvent.click(
    screen.getByRole('button', { name: COPY.login.submit }),
  );
  const dialog = await screen.findByRole('dialog', { name: copy.title });
  return { api, services, dialog };
}

const codeInput = (dialog: HTMLElement, label: string) =>
  within(dialog).getByLabelText(new RegExp(`^${label}`));

describe('TwoFactorModal (login second step)', () => {
  it('signs in with an authenticator code', async () => {
    const { api, services, dialog } = await openChallenge('totp', {
      [`POST ${VERIFY}`]: () => ({ status: 200, data: { accessToken: 't9' } }),
    });
    expect(services.store.getState().auth.accessToken).toBeNull();
    expect(api.callsTo(`POST ${EMAIL_CHALLENGE}`)).toHaveLength(0);
    const input = codeInput(dialog, copy.totpLabel);
    expect(input).toHaveFocus();
    await userEvent.type(input, '123456{Enter}');

    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.page.title }),
    ).toBeInTheDocument();
    expect(services.store.getState().auth.accessToken).toBe('t9');
    expect(api.callsTo(`POST ${VERIFY}`)[0]?.data).toBe(
      JSON.stringify({ tempToken: TEMP, code: '123456' }),
    );
  });

  it('validates the code before calling the API', async () => {
    const { api, dialog } = await openChallenge('totp');
    await userEvent.type(codeInput(dialog, copy.totpLabel), '12{Enter}');
    expect(codeInput(dialog, copy.totpLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(dialog).getByText(copy.codeInvalid)).toBeInTheDocument();
    expect(api.callsTo(`POST ${VERIFY}`)).toHaveLength(0);
  });

  it('shows a wrong code, clears the field and keeps the dialog', async () => {
    const { dialog } = await openChallenge('totp', {
      [`POST ${VERIFY}`]: () => ({
        status: 401,
        data: { errorCode: 'AUTH_INVALID_2FA_CODE' },
      }),
    });
    await userEvent.type(codeInput(dialog, copy.totpLabel), '000000{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      copy.errors.invalidCode,
    );
    expect(codeInput(dialog, copy.totpLabel)).toHaveValue('');
    expect(codeInput(dialog, copy.totpLabel)).toHaveFocus();
  });

  it('goes back to sign in when the temp token is dead', async () => {
    const { dialog } = await openChallenge('totp', {
      [`POST ${VERIFY}`]: () => ({
        status: 401,
        data: { errorCode: 'AUTH_INVALID_TEMP_TOKEN' },
      }),
    });
    await userEvent.type(codeInput(dialog, copy.totpLabel), '000000{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(copy.expired);
  });

  it('cancels back to the sign-in form', async () => {
    const { dialog } = await openChallenge('totp');
    await userEvent.click(
      within(dialog).getByRole('button', { name: copy.cancel }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
  });

  it('opens with focus on the code field', async () => {
    const { dialog } = await openChallenge('totp');
    expect(codeInput(dialog, copy.totpLabel)).toHaveFocus();
  });

  it('ignores a click on the overlay and closes on Esc', async () => {
    await openChallenge('totp');
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay as Element);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
  });

  it('sends the email code once on open, warns, and resends on request', async () => {
    const { api, dialog } = await openChallenge('email', {
      [`POST ${EMAIL_CHALLENGE}`]: () => ({ status: 202 }),
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      copy.emailWarning,
    );
    await waitFor(() =>
      expect(api.callsTo(`POST ${EMAIL_CHALLENGE}`)).toHaveLength(1),
    );
    expect(api.callsTo(`POST ${EMAIL_CHALLENGE}`)[0]?.data).toBe(
      JSON.stringify({ tempToken: TEMP }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: copy.resend }),
    );
    expect(await within(dialog).findByText(copy.resent)).toBeInTheDocument();
    expect(api.callsTo(`POST ${EMAIL_CHALLENGE}`)).toHaveLength(2);
  });

  it('blocks resend while rate-limited and says how long to wait', async () => {
    const { dialog } = await openChallenge('email', {
      [`POST ${EMAIL_CHALLENGE}`]: () => ({
        status: 429,
        headers: { 'retry-after': '30' },
      }),
    });
    expect(
      await within(dialog).findByText(
        COPY.password.errors.rateLimitedSeconds(30),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: copy.resend }),
    ).toBeDisabled();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import { createTestServices, renderApp } from '../../../test/RenderApp.fixture';
import { COPY } from '../../config/Copy.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { API_ERROR_CODES } from '../../config/Http.constants';
import { APP_ROUTES } from '../../config/App.routes';

const { REFRESH } = API_ENDPOINTS.AUTH;
const { STATUS, OWNER } = API_ENDPOINTS.SETUP;
const TOKEN = 'a-long-test-setup-token-value';
const EMAIL = 'owner@domain.localhost';
const PASSWORD = 'correct horse battery staple';

const OPEN: FakeHandler = () => ({ status: 200, data: { open: true } });
const CLOSED: FakeHandler = () => ({ status: 200, data: { open: false } });

async function openSetup(
  handlers: Record<string, FakeHandler>,
  statusHandler: FakeHandler = OPEN,
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 401 }),
    [`GET ${STATUS}`]: statusHandler,
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.SETUP);
  return { api };
}

const field = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}`));
const submit = () => screen.getByRole('button', { name: COPY.setup.submit });

async function waitForForm() {
  await screen.findByRole('heading', { level: 1, name: COPY.setup.title });
}

async function fillAndSubmit(repeat = PASSWORD) {
  await userEvent.type(field(COPY.setup.tokenLabel), TOKEN);
  await userEvent.type(field(COPY.setup.emailLabel), EMAIL);
  await userEvent.type(field(COPY.setup.passwordLabel), PASSWORD);
  await userEvent.type(field(COPY.setup.confirmPasswordLabel), repeat);
  await userEvent.click(submit());
}

const signInHeading = () =>
  screen.findByRole('heading', { level: 1, name: COPY.login.title });

describe('OwnerSetupPage', () => {
  it('redirects to sign in when the setup is closed', async () => {
    await openSetup({}, CLOSED);
    expect(await signInHeading()).toBeInTheDocument();
  });

  it('shows the checking state, then an error with a retry when the status fails', async () => {
    await openSetup({}, () => ({ status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.setup.statusFailed,
    );
    expect(
      screen.getByRole('button', { name: COPY.setup.retry }),
    ).toBeInTheDocument();
  });

  it('hides the token and passwords, and tells the browser not to store the token', async () => {
    await openSetup({});
    await waitForForm();
    expect(field(COPY.setup.tokenLabel)).toHaveAttribute('type', 'password');
    expect(field(COPY.setup.tokenLabel)).toHaveAttribute('autocomplete', 'off');
    expect(field(COPY.setup.passwordLabel)).toHaveAttribute('type', 'password');
  });

  it('blocks the submit when the repeated password differs', async () => {
    const { api } = await openSetup({
      [`POST ${OWNER}`]: () => ({ status: 201 }),
    });
    await waitForForm();
    await fillAndSubmit('another passphrase entirely');

    expect(field(COPY.setup.confirmPasswordLabel)).toHaveAccessibleDescription(
      COPY.setup.validation.passwordsDiffer,
    );
    expect(api.callsTo(`POST ${OWNER}`)).toHaveLength(0);
  });

  it('creates the owner, then lands on sign in with the notice and the email', async () => {
    const { api } = await openSetup({
      [`POST ${OWNER}`]: () => ({ status: 201, data: { email: EMAIL } }),
    });
    await waitForForm();
    await fillAndSubmit();

    expect(await signInHeading()).toBeInTheDocument();
    expect(
      screen.getByText(COPY.login.notices.ownerCreated),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveValue(EMAIL);
    const body = JSON.parse(
      String(api.callsTo(`POST ${OWNER}`)[0]?.data),
    ) as Record<string, unknown>;
    expect(body).toEqual({
      setupToken: TOKEN,
      email: EMAIL,
      password: PASSWORD,
    });
    expect(body).not.toHaveProperty('confirmPassword');
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.search).toBe('');
    expect(JSON.stringify(window.localStorage)).not.toContain(TOKEN);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(TOKEN);
  });

  it('sends the display name only when filled in', async () => {
    const { api } = await openSetup({
      [`POST ${OWNER}`]: () => ({ status: 201 }),
    });
    await waitForForm();
    await userEvent.type(field(COPY.setup.displayNameLabel), '  Mai Tran ');
    await fillAndSubmit();
    await signInHeading();
    const body = JSON.parse(String(api.callsTo(`POST ${OWNER}`)[0]?.data)) as {
      displayName?: string;
    };
    expect(body.displayName).toBe('Mai Tran');
  });

  it('shows a wrong token on the token field', async () => {
    await openSetup({ [`POST ${OWNER}`]: () => ({ status: 401 }) });
    await waitForForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(field(COPY.setup.tokenLabel)).toHaveAccessibleDescription(
        COPY.setup.errors.tokenInvalid,
      );
    });
    expect(field(COPY.setup.emailLabel)).toHaveValue(EMAIL);
  });

  it('shows server field errors on their fields', async () => {
    await openSetup({
      [`POST ${OWNER}`]: () => ({
        status: 400,
        data: {
          details: {
            issues: [
              { path: ['email'], message: 'must be a valid email address' },
            ],
          },
        },
      }),
    });
    await waitForForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(field(COPY.setup.emailLabel)).toHaveAccessibleDescription(
        'Must be a valid email address.',
      );
    });
  });

  it('shows a taken email on the email field', async () => {
    await openSetup({
      [`POST ${OWNER}`]: () => ({
        status: 409,
        data: { errorCode: API_ERROR_CODES.OWNER_EMAIL_TAKEN },
      }),
    });
    await waitForForm();
    await fillAndSubmit();

    await waitFor(() => {
      expect(field(COPY.setup.emailLabel)).toHaveAccessibleDescription(
        COPY.setup.errors.emailTaken,
      );
    });
  });

  it('goes to sign in with a notice when the setup closed meanwhile', async () => {
    await openSetup({ [`POST ${OWNER}`]: () => ({ status: 404 }) });
    await waitForForm();
    await fillAndSubmit();

    expect(await signInHeading()).toBeInTheDocument();
    expect(
      screen.getByText(COPY.login.notices.setupComplete),
    ).toBeInTheDocument();
  });

  it('shows the wait time in an alert when rate limited', async () => {
    await openSetup({
      [`POST ${OWNER}`]: () => ({
        status: 429,
        headers: { 'retry-after': '600' },
      }),
    });
    await waitForForm();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('10 minutes');
  });

  it('shows a generic alert for other failures', async () => {
    await openSetup({ [`POST ${OWNER}`]: () => ({ status: 503 }) });
    await waitForForm();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.setup.errors.unexpected,
    );
  });
});

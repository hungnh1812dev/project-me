import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deferred, type FakeReply } from '../../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/render-app';
import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { APP_ROUTES } from '../../config/routes';
import { fetchLiveHealth } from '../status/health.api';

vi.mock('../status/health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../status/health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));

const { LOGIN, REFRESH, ME } = API_ENDPOINTS.AUTH;
const PASSWORD = 'correct horse battery staple';

async function openLogin(loginReply: () => FakeReply | Promise<FakeReply>) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 401 }),
    [`POST ${LOGIN}`]: loginReply,
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.LOGIN);
  return { api, services };
}

const email = () => screen.getByLabelText(/^Email/);
const password = () => screen.getByLabelText(/^Password/);
const submit = () => screen.getByRole('button', { name: COPY.login.submit });

async function fillAndSubmit(pw = PASSWORD) {
  await userEvent.type(email(), TEST_USER.email);
  await userEvent.type(password(), pw);
  await userEvent.click(submit());
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(fetchLiveHealth).mockResolvedValue({ status: 'ok' });
  });

  it('labels its fields and focuses the first invalid one on submit', async () => {
    const { api } = await openLogin(() => ({ status: 500 }));
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.login.title }),
    ).toBeInTheDocument();
    await userEvent.click(submit());

    expect(email()).toHaveFocus();
    expect(email()).toHaveAccessibleDescription(
      COPY.login.validation.emailRequired,
    );
    expect(password()).toHaveAccessibleDescription(
      COPY.login.validation.passwordRequired,
    );
    expect(api.callsTo(`POST ${LOGIN}`)).toHaveLength(0);
  });

  it('validates the email format after blur', async () => {
    await openLogin(() => ({ status: 500 }));
    await userEvent.type(email(), 'not-an-email');
    await userEvent.tab();
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAccessibleDescription(
      COPY.login.validation.emailInvalid,
    );
  });

  it('shows loading on the submit button, then signs in and leaves the page', async () => {
    const gate = deferred<FakeReply>();
    const { api, services } = await openLogin(() => gate.promise);
    await fillAndSubmit();

    expect(submit()).toHaveAttribute('aria-busy', 'true');
    expect(submit()).toBeDisabled();
    gate.resolve({ status: 200, data: { accessToken: 't1' } });

    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.page.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.displayName)).toBeInTheDocument();
    expect(api.callsTo(`POST ${LOGIN}`)[0]?.data).toBe(
      JSON.stringify({ email: TEST_USER.email, password: PASSWORD }),
    );
    expect(services.store.getState().auth.accessToken).toBe('t1');
  });

  it('shows one generic message for wrong credentials and refocuses the password', async () => {
    await openLogin(() => ({
      status: 401,
      data: { errorCode: 'AUTH_INVALID_CREDENTIALS' },
    }));
    await fillAndSubmit('wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.login.errors.invalidCredentials,
    );
    expect(password()).toHaveValue('');
    expect(password()).toHaveFocus();
    expect(email()).toHaveValue(TEST_USER.email);
  });

  it('tells a rate-limited user how long to wait', async () => {
    await openLogin(() => ({
      status: 429,
      headers: { 'retry-after': '840' },
    }));
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.login.errors.rateLimitedMinutes(14),
    );
  });

  it('reports a network error', async () => {
    await openLogin(() => 'network-error');
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.login.errors.network,
    );
  });

  it('sends an already signed-in user home', async () => {
    const { services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    });
    await services.session.restore();
    renderApp(services, APP_ROUTES.LOGIN);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: COPY.page.title }),
      ).toBeInTheDocument();
    });
  });

  it('links to the password reset page', async () => {
    await openLogin(() => ({ status: 500 }));
    await userEvent.click(
      screen.getByRole('link', { name: COPY.login.forgotPassword }),
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: COPY.password.reset.requestTitle,
      }),
    ).toBeInTheDocument();
  });

  describe('owner setup prompt', () => {
    const SETUP_STATUS = `GET ${API_ENDPOINTS.SETUP.STATUS}`;

    async function openLoginWithStatus(statusReply: () => FakeReply) {
      const { services } = createTestServices({
        [`POST ${REFRESH}`]: () => ({ status: 401 }),
        [SETUP_STATUS]: statusReply,
      });
      await services.session.restore();
      renderApp(services, APP_ROUTES.LOGIN);
    }

    it('offers the owner setup while it is open', async () => {
      await openLoginWithStatus(() => ({ status: 200, data: { open: true } }));
      expect(
        await screen.findByText(COPY.login.setupPrompt.message),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: COPY.login.setupPrompt.action }),
      ).toHaveAttribute('href', APP_ROUTES.SETUP);
    });

    it('shows nothing extra when the setup is closed', async () => {
      await openLoginWithStatus(() => ({ status: 200, data: { open: false } }));
      await waitFor(() => {
        expect(
          screen.queryByText(COPY.login.setupPrompt.message),
        ).not.toBeInTheDocument();
      });
    });

    it('shows nothing extra when the status call fails', async () => {
      await openLoginWithStatus(() => ({ status: 500 }));
      await waitFor(() => {
        expect(
          screen.queryByText(COPY.login.setupPrompt.message),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.getByRole('heading', { level: 1, name: COPY.login.title }),
      ).toBeInTheDocument();
    });
  });
});

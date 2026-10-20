import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deferred, type FakeReply } from '../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../test/render-app';
import { COPY } from '../config/copy.constants';
import { API_ENDPOINTS } from '../config/endpoints';
import { fetchLiveHealth } from '../features/status/health.api';

vi.mock('../features/status/health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/status/health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));

const fetchLiveHealthMock = vi.mocked(fetchLiveHealth);
const { REFRESH, LOGOUT, ME } = API_ENDPOINTS.AUTH;

function signedInServices() {
  return createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`POST ${LOGOUT}`]: () => ({ status: 204 }),
  });
}

const loginHeading = () =>
  screen.findByRole('heading', { level: 1, name: COPY.login.title });

describe('App', () => {
  beforeEach(() => {
    fetchLiveHealthMock.mockReset();
    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
  });

  it('shows a loading state, not the login page, while the session restores', async () => {
    const gate = deferred<FakeReply>();
    const { services } = createTestServices({
      [`POST ${REFRESH}`]: () => gate.promise,
      [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    });
    const restoring = services.session.restore();
    renderApp(services);

    expect(screen.getByRole('status')).toHaveTextContent(
      COPY.session.restoring,
    );
    expect(
      screen.queryByRole('heading', { name: COPY.login.title }),
    ).not.toBeInTheDocument();

    gate.resolve({ status: 200, data: { accessToken: 't1' } });
    await restoring;
    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.page.title }),
    ).toBeInTheDocument();
  });

  it('sends an anonymous visitor to the login page', async () => {
    const { services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 401 }),
    });
    await services.session.restore();
    renderApp(services, '/some/deep/link');
    expect(await loginHeading()).toBeInTheDocument();
  });

  it('shows the signed-in user and signs out to the login page', async () => {
    const { api, services } = signedInServices();
    await services.session.restore();
    renderApp(services);

    expect(
      await screen.findByRole('heading', { level: 1, name: COPY.page.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.displayName)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: COPY.session.signOut }),
    );
    expect(await loginHeading()).toBeInTheDocument();
    expect(api.callsTo(`POST ${LOGOUT}`)).toHaveLength(1);
    expect(services.store.getState().auth.accessToken).toBeNull();
  });

  it('renders the status card on the home page (form-commons button)', async () => {
    const { services } = signedInServices();
    await services.session.restore();
    renderApp(services);

    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/v1\/health\/live$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: COPY.status.checkAgain }),
    ).toHaveAttribute('data-slot', 'button');
  });

  it('shows the error state and recovers on "check again"', async () => {
    fetchLiveHealthMock
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ status: 'ok' });
    const { services } = signedInServices();
    await services.session.restore();
    renderApp(services);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.status.errorHint,
    );
    await userEvent.click(
      screen.getByRole('button', { name: COPY.status.checkAgain }),
    );
    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an unexpected health body as unreachable', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'error' });
    const { services } = signedInServices();
    await services.session.restore();
    renderApp(services);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

import {
  createFakeApi,
  deferred,
  TEST_API_BASE_URL,
} from '../../../test/FakeApi.fixture';
import { fakeBus, fakeLocks } from '../../../test/FakeTabs.fixture';
import { createTestServices, TEST_USER } from '../../../test/RenderApp.fixture';
import { createAuthTestStore } from './AuthStore.fixture';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { createApiClient } from '../../lib/Api.client';
import { createAuthApi } from './Auth.api';
import { createSession } from './Session';

const { LOGIN, REFRESH, LOGOUT, ME } = API_ENDPOINTS.AUTH;
const { VERIFY } = API_ENDPOINTS.TWO_FACTOR;

const meOk = () => ({ status: 200, data: TEST_USER });

describe('session', () => {
  it('restores a session from the refresh cookie on start', async () => {
    const { api, services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${ME}`]: meOk,
    });
    await services.session.restore();
    expect(services.store.getState().auth).toEqual({
      status: 'authenticated',
      accessToken: 't1',
      user: TEST_USER,
      endNotice: null,
    });
    expect(api.callsTo(`GET ${ME}`)[0]?.headers.get('Authorization')).toBe(
      'Bearer t1',
    );
  });

  it('becomes anonymous when there is no valid refresh cookie', async () => {
    const { api, services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 401 }),
    });
    await services.session.restore();
    expect(services.store.getState().auth.status).toBe('anonymous');
    expect(api.calls).toHaveLength(1);
  });

  it('shares one refresh between app start and a protected 401', async () => {
    const gate = deferred<void>();
    const { api, services } = createTestServices({
      [`POST ${REFRESH}`]: async () => {
        await gate.promise;
        return { status: 200, data: { accessToken: 't1' } };
      },
      [`GET ${ME}`]: meOk,
    });
    const first = services.session.restore();
    const second = services.session.refreshAccessToken();
    gate.resolve();
    await Promise.all([first, second]);
    expect(api.callsTo(`POST ${REFRESH}`)).toHaveLength(1);
  });

  it('signs in: token in memory, user from /me', async () => {
    const { services } = createTestServices({
      [`POST ${LOGIN}`]: () => ({ status: 200, data: { accessToken: 't2' } }),
      [`GET ${ME}`]: meOk,
    });
    const outcome = await services.session.signIn({
      email: TEST_USER.email,
      password: 'pw',
    });
    expect(outcome).toEqual({ kind: 'signed-in', accessToken: 't2' });
    expect(services.store.getState().auth.status).toBe('authenticated');
  });

  it('stores nothing when login asks for 2FA', async () => {
    const { api, services } = createTestServices({
      [`POST ${LOGIN}`]: () => ({
        status: 200,
        data: { requires2FA: true, tempToken: 'temp', methods: ['totp'] },
      }),
    });
    const outcome = await services.session.signIn({
      email: TEST_USER.email,
      password: 'pw',
    });
    expect(outcome).toEqual({
      kind: 'two-factor-required',
      tempToken: 'temp',
      methods: ['totp'],
    });
    // The temp token stays with the caller, never in the store.
    expect(JSON.stringify(services.store.getState())).not.toContain('temp');
    expect(services.store.getState().auth.accessToken).toBeNull();
    expect(api.callsTo(`GET ${ME}`)).toHaveLength(0);
  });

  it('completes a 2FA sign-in with the code, then loads /me', async () => {
    const { api, services } = createTestServices({
      [`POST ${VERIFY}`]: () => ({ status: 200, data: { accessToken: 't3' } }),
      [`GET ${ME}`]: meOk,
    });
    await services.session.completeTwoFactor({
      tempToken: 'temp',
      code: '123456',
    });
    expect(services.store.getState().auth).toMatchObject({
      status: 'authenticated',
      accessToken: 't3',
    });
    expect(api.callsTo(`POST ${VERIFY}`)[0]?.data).toBe(
      JSON.stringify({ tempToken: 'temp', code: '123456' }),
    );
  });

  it('signs out and clears the session even when logout fails', async () => {
    const { api, services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${ME}`]: meOk,
      [`POST ${LOGOUT}`]: () => 'network-error',
    });
    await services.session.restore();
    const clear = vi.spyOn(services.queryClient, 'clear');
    await services.session.signOut();
    expect(api.callsTo(`POST ${LOGOUT}`)).toHaveLength(1);
    expect(services.store.getState().auth.status).toBe('anonymous');
    expect(services.store.getState().auth.accessToken).toBeNull();
    expect(clear).toHaveBeenCalled();
  });

  it('ends the session when a protected call cannot be renewed', async () => {
    const { api, client, services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${ME}`]: meOk,
    });
    await services.session.restore();
    // Server-side revocation: the token and the refresh cookie are both dead.
    api.handlers[`GET ${ME}`] = () => ({ status: 401 });
    api.handlers[`POST ${REFRESH}`] = () => ({ status: 401 });

    await expect(client.get(ME)).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(services.store.getState().auth).toEqual({
      status: 'anonymous',
      accessToken: null,
      user: null,
      endNotice: null,
    });
  });
});

describe('session across tabs', () => {
  it('sends one network refresh when several tabs refresh at once', async () => {
    const gate = deferred<void>();
    let issued = 0;
    const api = createFakeApi({
      [`POST ${REFRESH}`]: async () => {
        issued += 1;
        await gate.promise;
        return { status: 200, data: { accessToken: `t${issued}` } };
      },
    });
    const client = createApiClient(TEST_API_BASE_URL, {
      adapter: api.adapter,
      withCredentials: true,
    });
    const locks = fakeLocks();
    const bus = fakeBus();
    const tabs = [1, 2, 3].map(() => {
      const store = createAuthTestStore();
      const session = createSession({
        dispatch: store.dispatch,
        authApi: createAuthApi(client),
        crossTab: { locks, channel: bus.channel(), lockName: 'test:refresh' },
      });
      return { store, session };
    });

    const refreshed = Promise.all(
      tabs.map(({ session }) => session.refreshAccessToken()),
    );
    gate.resolve();
    expect(await refreshed).toEqual(['t1', 't1', 't1']);
    expect(api.callsTo(`POST ${REFRESH}`)).toHaveLength(1);
    for (const { store } of tabs) {
      expect(store.getState().auth.accessToken).toBe('t1');
    }
  });
});

import { deferred } from '../../../test/fake-api';
import { createTestServices, TEST_USER } from '../../../test/render-app';
import { API_ENDPOINTS } from '../../config/endpoints';

const { LOGIN, REFRESH, LOGOUT, ME } = API_ENDPOINTS.AUTH;

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
    expect(outcome).toEqual({ kind: 'two-factor-required' });
    expect(JSON.stringify(services.store.getState())).not.toContain('temp');
    expect(services.store.getState().auth.accessToken).toBeNull();
    expect(api.callsTo(`GET ${ME}`)).toHaveLength(0);
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
    });
  });
});

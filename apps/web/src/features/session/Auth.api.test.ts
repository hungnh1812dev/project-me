import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { clientApi, type ClientApi } from '@/apis/client/Api.client';

import { createAuthApi, PrivilegedAccessError } from './Auth.api';
import { httpError, TEST_USER } from './Session.fixture';

function clientAnswering(respond: (config: InternalAxiosRequestConfig) => unknown) {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    const result = respond(config);
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve({ data: result, status: 200, statusText: 'OK', headers: {}, config });
  };
  const client: ClientApi = {
    get: (path, options) => clientApi.get(path, { ...options, adapter }),
    post: (path, body, options) => clientApi.post(path, body, { ...options, adapter }),
    put: (path, body, options) => clientApi.put(path, body, { ...options, adapter }),
    patch: (path, body, options) => clientApi.patch(path, body, { ...options, adapter }),
    delete: (path, options) => clientApi.delete(path, { ...options, adapter }),
  };
  return { api: createAuthApi(client), seen };
}

describe('createAuthApi', () => {
  it('reads the session from the BFF', async () => {
    const { api, seen } = clientAnswering(() => ({ user: TEST_USER }));
    await expect(api.readSession()).resolves.toEqual(TEST_USER);
    expect(seen[0]).toMatchObject({ method: 'get', url: '/session', baseURL: '/api/v1' });
  });

  it('reads no session as null', async () => {
    const { api } = clientAnswering(() => ({ user: null }));
    await expect(api.readSession()).resolves.toBeNull();
  });

  it('maps a finished login to the visitor and posts the human check token and rememberMe', async () => {
    const { api, seen } = clientAnswering(() => ({ status: 'signed-in', user: TEST_USER }));
    const credentials = {
      email: 'a@b.co',
      password: 'pw',
      rememberMe: true,
      humanCheckToken: 'hc',
    };
    await expect(api.login(credentials)).resolves.toEqual({ kind: 'signed-in', user: TEST_USER });
    expect(seen[0]?.url).toBe('/auth/login');
    expect(JSON.parse(seen[0]?.data as string)).toEqual(credentials);
  });

  it('maps a 2FA login to its methods only', async () => {
    const { api } = clientAnswering(() => ({ status: 'two-factor-required', methods: ['email'] }));
    await expect(
      api.login({ email: 'a@b.co', password: 'pw', rememberMe: false }),
    ).resolves.toEqual({
      kind: 'two-factor-required',
      methods: ['email'],
    });
  });

  it('returns the visitor after the code check', async () => {
    const { api, seen } = clientAnswering(() => ({ user: TEST_USER }));
    await expect(api.verifyTwoFactor({ code: '123456' })).resolves.toEqual(TEST_USER);
    expect(seen[0]?.url).toBe('/auth/two-factor/verify');
  });

  it('sends a JSON body with the email code request, even without a token', async () => {
    const { api, seen } = clientAnswering(() => null);
    await api.sendLoginEmailCode();
    expect(seen[0]?.url).toBe('/auth/two-factor/email-code');
    expect(seen[0]?.data).toBe('{}');
    expect(seen[0]?.headers.get('Content-Type')).toContain('application/json');
  });

  it('sends a JSON body on logout', async () => {
    const { api, seen } = clientAnswering(() => null);
    await api.logout();
    expect(seen[0]?.url).toBe('/auth/logout');
    expect(seen[0]?.data).toBe('{}');
    expect(seen[0]?.headers.get('Content-Type')).toContain('application/json');
  });

  it.each(['login', 'verifyTwoFactor'] as const)(
    '%s turns BFF_PRIVILEGED_ACCOUNT into PrivilegedAccessError',
    async (method) => {
      const { api } = clientAnswering(() =>
        httpError(403, { errorCode: 'BFF_PRIVILEGED_ACCOUNT' }),
      );
      const call =
        method === 'login'
          ? api.login({ email: 'a@b.co', password: 'pw', rememberMe: false })
          : api.verifyTwoFactor({ code: '123456' });
      await expect(call).rejects.toBeInstanceOf(PrivilegedAccessError);
    },
  );

  it('lets any other failure through as its WebApiError', async () => {
    const { api } = clientAnswering(() => httpError(401, { errorCode: 'BFF_INVALID_CREDENTIALS' }));
    await expect(
      api.login({ email: 'a@b.co', password: 'pw', rememberMe: false }),
    ).rejects.toMatchObject({ errorCode: 'BFF_INVALID_CREDENTIALS', statusCode: 401 });
  });
});

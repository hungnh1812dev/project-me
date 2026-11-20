import { createApiClient } from '@apis/client/Api.client';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { createFakeApi, TEST_API_BASE_URL } from '@test/FakeApi.fixture';

import { createAuthApi } from './Auth.api';
import { installAuthInterceptor } from './Auth.interceptor';

function setup() {
  const api = createFakeApi({
    [`POST ${API_ENDPOINTS.AUTH.LOGIN}`]: () => ({ status: 401 }),
    [`POST ${API_ENDPOINTS.TWO_FACTOR.VERIFY}`]: () => ({
      status: 200,
      data: { accessToken: 't' },
    }),
    [`POST ${API_ENDPOINTS.TWO_FACTOR.EMAIL_CHALLENGE}`]: () => ({ status: 202 }),
  });
  const client = createApiClient(TEST_API_BASE_URL, { adapter: api.adapter });
  const refreshAccessToken = vi.fn<() => Promise<string>>();
  const onSessionExpired = vi.fn<() => void>();
  installAuthInterceptor(client, {
    getAccessToken: () => 'held-token',
    refreshAccessToken,
    onSessionExpired,
  });
  return { api, authApi: createAuthApi(client), refreshAccessToken };
}

describe('createAuthApi', () => {
  it('sends login without a Bearer header and does not refresh on a 401', async () => {
    const { api, authApi, refreshAccessToken } = setup();
    await expect(
      authApi.login({
        email: 'a@example.com',
        password: 'wrong',
        rememberMe: false,
        turnstileToken: 'check-token',
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.headers.get('Authorization')).toBeUndefined();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('sends the human check token in the login, verify and email challenge bodies', async () => {
    const { api, authApi } = setup();
    await authApi
      .login({ email: 'a@example.com', password: 'pw', rememberMe: true, turnstileToken: 'one' })
      .catch(() => undefined);
    await authApi.verifyTwoFactor({ tempToken: 'temp', code: '123456', turnstileToken: 'two' });
    await authApi.sendLoginEmailCode({ tempToken: 'temp', turnstileToken: 'three' });

    expect(api.callsTo(`POST ${API_ENDPOINTS.AUTH.LOGIN}`)[0]?.data).toBe(
      JSON.stringify({
        email: 'a@example.com',
        password: 'pw',
        rememberMe: true,
        turnstileToken: 'one',
      }),
    );
    expect(api.callsTo(`POST ${API_ENDPOINTS.TWO_FACTOR.VERIFY}`)[0]?.data).toBe(
      JSON.stringify({ tempToken: 'temp', code: '123456', turnstileToken: 'two' }),
    );
    expect(api.callsTo(`POST ${API_ENDPOINTS.TWO_FACTOR.EMAIL_CHALLENGE}`)[0]?.data).toBe(
      JSON.stringify({ tempToken: 'temp', turnstileToken: 'three' }),
    );
  });
});

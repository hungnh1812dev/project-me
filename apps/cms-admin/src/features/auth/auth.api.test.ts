import { createFakeApi, TEST_API_BASE_URL } from '../../../test/fake-api';
import { API_ENDPOINTS } from '../../config/endpoints';
import { createApiClient } from '../../lib/api-client';
import { createAuthApi } from './auth.api';
import { installAuthInterceptor } from './auth-interceptor';

function setup() {
  const api = createFakeApi({
    [`POST ${API_ENDPOINTS.AUTH.LOGIN}`]: () => ({ status: 401 }),
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
      authApi.login({ email: 'a@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.headers.get('Authorization')).toBeUndefined();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

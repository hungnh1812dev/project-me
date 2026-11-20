import { createApiClient } from '@apis/client/Api.client';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { createFakeApi, TEST_API_BASE_URL } from '@test/FakeApi.fixture';

import { createPasswordApi } from './Password.api';

function setup() {
  const api = createFakeApi({
    [`POST ${API_ENDPOINTS.PASSWORD.REQUEST_OTP}`]: () => ({ status: 202 }),
    [`POST ${API_ENDPOINTS.PASSWORD.RESET}`]: () => ({ status: 204 }),
    [`POST ${API_ENDPOINTS.PASSWORD.SET}`]: () => ({ status: 204 }),
  });
  const client = createApiClient(TEST_API_BASE_URL, { adapter: api.adapter });
  return { api, passwordApi: createPasswordApi(client) };
}

describe('createPasswordApi', () => {
  it('sends the human check token in the request-code and reset bodies', async () => {
    const { api, passwordApi } = setup();
    await passwordApi.requestCode({ email: 'a@example.com', turnstileToken: 'one' });
    await passwordApi.reset({
      email: 'a@example.com',
      code: '123456',
      newPassword: 'pw',
      turnstileToken: 'two',
    });

    expect(api.callsTo(`POST ${API_ENDPOINTS.PASSWORD.REQUEST_OTP}`)[0]?.data).toBe(
      JSON.stringify({ email: 'a@example.com', turnstileToken: 'one' }),
    );
    expect(api.callsTo(`POST ${API_ENDPOINTS.PASSWORD.RESET}`)[0]?.data).toBe(
      JSON.stringify({
        email: 'a@example.com',
        code: '123456',
        newPassword: 'pw',
        turnstileToken: 'two',
      }),
    );
  });

  it('sends no human check token when setting a password', async () => {
    const { api, passwordApi } = setup();
    await passwordApi.setPassword({ email: 'a@example.com', code: '123456', newPassword: 'pw' });

    expect(String(api.callsTo(`POST ${API_ENDPOINTS.PASSWORD.SET}`)[0]?.data)).not.toContain(
      'turnstileToken',
    );
  });
});

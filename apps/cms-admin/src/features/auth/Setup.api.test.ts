import { createApiClient } from '@apis/client/Api.client';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { createFakeApi, TEST_API_BASE_URL } from '@test/FakeApi.fixture';

import { createSetupApi } from './Setup.api';

describe('createSetupApi', () => {
  it('sends the human check token in the owner setup body', async () => {
    const api = createFakeApi({ [`POST ${API_ENDPOINTS.SETUP.OWNER}`]: () => ({ status: 201 }) });
    const setupApi = createSetupApi(createApiClient(TEST_API_BASE_URL, { adapter: api.adapter }));

    await setupApi.createOwner({
      setupToken: 'setup',
      email: 'a@example.com',
      password: 'pw',
      turnstileToken: 'check-token',
    });

    expect(api.callsTo(`POST ${API_ENDPOINTS.SETUP.OWNER}`)[0]?.data).toBe(
      JSON.stringify({
        setupToken: 'setup',
        email: 'a@example.com',
        password: 'pw',
        turnstileToken: 'check-token',
      }),
    );
  });
});

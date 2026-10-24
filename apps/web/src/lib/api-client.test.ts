import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { apiClient, createApiClient } from './api-client';

const BASE_URL = '/api/v1';

function clientCapturingRequests() {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({
      data: null,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
  return { client: createApiClient(BASE_URL, { adapter }), seen };
}

describe('createApiClient', () => {
  it.each(['get', 'post', 'delete'] as const)(
    'strips the trailing slash from %s paths',
    async (method) => {
      const { client, seen } = clientCapturingRequests();
      await client[method]('/health/live/');
      expect(seen[0]?.url).toBe('/health/live');
      expect(seen[0]?.baseURL).toBe(BASE_URL);
    },
  );

  it('keeps the query string', async () => {
    const { client, seen } = clientCapturingRequests();
    await client.get('/health/live/?probe=1');
    expect(seen[0]?.url).toBe('/health/live?probe=1');
  });

  it('sets no Authorization default on the shared client', () => {
    expect(apiClient.defaults.headers).not.toHaveProperty('Authorization');
    expect(apiClient.defaults.headers.common).not.toHaveProperty(
      'Authorization',
    );
  });
});

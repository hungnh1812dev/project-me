import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { BFF_BASE_PATH, BFF_ENDPOINTS } from '@/configs/Api.endpoints';

import { clientApi } from './Api.client';

function capturingAdapter() {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: null, status: 200, statusText: 'OK', headers: {}, config });
  };
  return { adapter, seen };
}

describe('clientApi', () => {
  it.each(['get', 'delete'] as const)('sends %s to the BFF base path', async (method) => {
    const { adapter, seen } = capturingAdapter();
    await clientApi[method](BFF_ENDPOINTS.SESSION, { adapter });
    expect(seen[0]).toMatchObject({ method, url: '/session', baseURL: BFF_BASE_PATH });
  });

  it.each(['post', 'put', 'patch'] as const)('sends %s with its body', async (method) => {
    const { adapter, seen } = capturingAdapter();
    await clientApi[method](BFF_ENDPOINTS.LOGOUT, { a: 1 }, { adapter });
    expect(seen[0]).toMatchObject({ method, url: '/auth/logout', baseURL: BFF_BASE_PATH });
    expect(JSON.parse(seen[0]?.data as string)).toEqual({ a: 1 });
  });

  it('strips the trailing slash and keeps the query string', async () => {
    const { adapter, seen } = capturingAdapter();
    await clientApi.get('/health/?probe=1' as never, { adapter });
    expect(seen[0]?.url).toBe('/health?probe=1');
  });

  it('sets no Authorization header', async () => {
    const { adapter, seen } = capturingAdapter();
    await clientApi.get(BFF_ENDPOINTS.HEALTH, { adapter });
    expect(seen[0]?.headers.has('Authorization')).toBe(false);
  });
});

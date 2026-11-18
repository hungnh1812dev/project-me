import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { WebApiError } from '@/apis/WebApi.errors';
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

  describe('failures', () => {
    function failing(error: Error) {
      const adapter: AxiosAdapter = () => Promise.reject(error);
      return clientApi.get(BFF_ENDPOINTS.SESSION, { adapter }).catch((cause: unknown) => cause);
    }

    function answer(status: number, data: unknown, headers = {}) {
      return new AxiosError('failed', undefined, undefined, undefined, {
        status,
        data,
        headers,
      } as AxiosResponse);
    }

    it('reads no answer as a retryable client network error', async () => {
      const error = await failing(new AxiosError('down'));
      expect(error).toBeInstanceOf(WebApiError);
      expect(error).toMatchObject({
        source: 'client',
        errorCode: 'CLIENT_NETWORK',
        retryable: true,
      });
    });

    it('reads a BFF answer by its error code', async () => {
      const error = await failing(
        answer(401, { statusCode: 401, errorCode: 'BFF_INVALID_CREDENTIALS' }),
      );
      expect(error).toMatchObject({
        source: 'bff',
        errorCode: 'BFF_INVALID_CREDENTIALS',
        statusCode: 401,
      });
    });

    it('reads an unknown body as CLIENT_HTTP and never keeps its text', async () => {
      const error = await failing(
        answer(502, { errorCode: 'SECRET_UPSTREAM', message: 'token abc' }),
      );
      expect(error).toMatchObject({ errorCode: 'CLIENT_HTTP', statusCode: 502 });
      expect(JSON.stringify(error)).not.toContain('abc');
    });

    it('keeps the Retry-After of a 429, with or without the BFF code', async () => {
      const coded = await failing(
        answer(429, { errorCode: 'BFF_RATE_LIMITED' }, { 'retry-after': '30' }),
      );
      expect(coded).toMatchObject({ errorCode: 'BFF_RATE_LIMITED', retryAfterSeconds: 30 });
      const bare = await failing(answer(429, null, { 'retry-after': '5' }));
      expect(bare).toMatchObject({ errorCode: 'CLIENT_RATE_LIMITED', retryAfterSeconds: 5 });
    });

    it('reads a non-axios error as unexpected', async () => {
      expect(await failing(new Error('boom'))).toMatchObject({ errorCode: 'CLIENT_UNEXPECTED' });
    });
  });
});

import {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

/** What a fake endpoint answers; `'network-error'` rejects without a response. */
export type FakeReply =
  | { status: number; data?: unknown; headers?: Record<string, string> }
  | 'network-error';

export type FakeHandler = (
  config: InternalAxiosRequestConfig,
) => FakeReply | Promise<FakeReply>;

export const TEST_API_BASE_URL = 'http://domain.localhost/api/v1';

const FIRST_ERROR_STATUS = 400;

/**
 * Axios adapter answering from `handlers`, keyed `"<METHOD> <path>"` (e.g.
 * `"POST /auth/login"`). Records every request it sees. Unknown routes 404.
 */
export function createFakeApi(handlers: Record<string, FakeHandler> = {}) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`;
    const handler = handlers[key];
    const reply: FakeReply =
      handler === undefined ? { status: 404 } : await handler(config);
    if (reply === 'network-error') {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    }
    const response: AxiosResponse = {
      data: reply.data ?? null,
      status: reply.status,
      statusText: String(reply.status),
      headers: reply.headers ?? {},
      config,
    };
    if (reply.status >= FIRST_ERROR_STATUS) {
      throw new AxiosError(
        `Request failed with status code ${reply.status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response,
      );
    }
    return response;
  };

  return {
    adapter,
    calls,
    handlers,
    /** Calls made to one route. */
    callsTo(key: string) {
      return calls.filter(
        (c) => `${(c.method ?? 'get').toUpperCase()} ${c.url ?? ''}` === key,
      );
    },
  };
}

/** A promise you resolve from the test, to hold a request in flight. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

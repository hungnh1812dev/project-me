import 'server-only';

import axios, { isAxiosError, type AxiosResponse } from 'axios';

import {
  API_TIMEOUT_MS,
  DEFAULT_REVALIDATE_SECONDS,
  HTTP_STATUS,
  REDIRECT_STATUS_MIN,
} from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

/** Why a call gave no answer. Any HTTP status, 4xx and 5xx included, is an answer. */
export const SERVER_API_FAILURE_CODES = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  REDIRECT: 'REDIRECT',
  INVALID_BODY: 'INVALID_BODY',
} as const;

export type ServerApiFailureCode =
  (typeof SERVER_API_FAILURE_CODES)[keyof typeof SERVER_API_FAILURE_CODES];

/** Carries the code only: never the upstream message, the request body or a header. */
export class ServerApiError extends Error {
  constructor(readonly code: ServerApiFailureCode) {
    super(`Server API call failed: ${code}`);
    this.name = 'ServerApiError';
  }
}

export type ServerApiCache = { revalidateSeconds: number } | 'no-store';

export interface ServerApiOptions {
  headers?: Record<string, string>;
  /** Sent as JSON. */
  body?: unknown;
  /** Defaults to `DEFAULT_REVALIDATE_SECONDS`. */
  cache?: ServerApiCache;
  timeoutMs?: number;
  /** When true, an answer body that is not JSON throws `INVALID_BODY`; otherwise the body is `undefined`. */
  needsBody?: boolean;
}

export interface ServerApiAnswer {
  status: number;
  headers: Headers;
  /** Parsed JSON, or `undefined` when the answer has none or it is not JSON. */
  body: unknown;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const TIMEOUT_AXIOS_CODES: ReadonlySet<string | undefined> = new Set(['ETIMEDOUT', 'ECONNABORTED']);

/**
 * The fetch adapter hands Next's patched `fetch` the `next` / `cache` options, so
 * the data cache applies (the spike is recorded in docs/modules/web/apis-server.md).
 * `maxRedirects: 0` makes the adapter use `redirect: 'manual'`.
 */
const http = axios.create({
  adapter: 'fetch',
  maxRedirects: 0,
  responseType: 'text',
  transformResponse: [(raw: unknown) => raw],
  validateStatus: () => true,
});

/** `next` is Next's addition to `RequestInit`, unknown to axios' types. */
function fetchOptionsOf(cache: ServerApiCache): RequestInit {
  return cache === 'no-store' ? { cache } : { next: { revalidate: cache.revalidateSeconds } };
}

function parseBody(raw: unknown, needsBody: boolean): unknown {
  if (typeof raw !== 'string' || raw === '') {
    if (needsBody) throw new ServerApiError(SERVER_API_FAILURE_CODES.INVALID_BODY);
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    if (needsBody) throw new ServerApiError(SERVER_API_FAILURE_CODES.INVALID_BODY);
    return undefined;
  }
}

function headersOf(response: AxiosResponse): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    for (const line of Array.isArray(value) ? value : [value]) {
      if (typeof line === 'string') headers.append(name, line);
    }
  }
  return headers;
}

function failureOf(error: unknown): ServerApiError {
  const isTimeout = isAxiosError(error) && TIMEOUT_AXIOS_CODES.has(error.code);
  return new ServerApiError(
    isTimeout ? SERVER_API_FAILURE_CODES.TIMEOUT : SERVER_API_FAILURE_CODES.NETWORK,
  );
}

async function call(
  method: HttpMethod,
  path: string,
  options: ServerApiOptions,
): Promise<ServerApiAnswer> {
  let response: AxiosResponse;
  try {
    response = await http.request({
      url: `${getServerEnv().apiInternalUrl}${path}`,
      method,
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      ...(options.body === undefined ? {} : { data: options.body }),
      timeout: options.timeoutMs ?? API_TIMEOUT_MS,
      fetchOptions: fetchOptionsOf(
        options.cache ?? { revalidateSeconds: DEFAULT_REVALIDATE_SECONDS },
      ),
    });
  } catch (error) {
    throw failureOf(error);
  }
  if (response.status >= REDIRECT_STATUS_MIN && response.status < HTTP_STATUS.BAD_REQUEST) {
    throw new ServerApiError(SERVER_API_FAILURE_CODES.REDIRECT);
  }
  return {
    status: response.status,
    headers: headersOf(response),
    body: parseBody(response.data, options.needsBody === true),
  };
}

/**
 * The one transport for cms-api calls made by the Next server (WEB-1). `path`
 * is a value of `API_ENDPOINTS`. Does not know tokens: the caller sets headers.
 */
export const serverApi = {
  get: (path: string, options: ServerApiOptions = {}) => call('GET', path, options),
  post: (path: string, options: ServerApiOptions = {}) => call('POST', path, options),
  put: (path: string, options: ServerApiOptions = {}) => call('PUT', path, options),
  patch: (path: string, options: ServerApiOptions = {}) => call('PATCH', path, options),
  delete: (path: string, options: ServerApiOptions = {}) => call('DELETE', path, options),
};

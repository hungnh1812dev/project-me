import 'server-only';

import axios, { isAxiosError, type AxiosResponse } from 'axios';

import {
  API_ERROR_CODES,
  API_ERROR_SOURCES,
  logApiError,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import {
  API_TIMEOUT_MS,
  DEFAULT_REVALIDATE_SECONDS,
  HTTP_STATUS,
  REDIRECT_STATUS_MIN,
} from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

export interface ServerApiAnswer {
  status: number;
  headers: Headers;
  /** Parsed JSON, or `undefined` when the answer has none or it is not JSON. */
  body: unknown;
}

/** Next's own meaning: seconds, or `false` for no expiry; `0` means no cache. */
export interface ServerApiNextOptions {
  revalidate?: number | false;
  tags?: string[];
}

export interface ServerApiOptions<T = unknown> {
  headers?: Record<string, string>;
  /** Sent as JSON. */
  body?: unknown;
  /** Turns any non-redirect answer into `T`; without it a 2xx gives its body and other statuses throw. */
  resolveData?: (answer: ServerApiAnswer) => T;
  /** `revalidate` defaults to `DEFAULT_REVALIDATE_SECONDS`; `WEB_REVALIDATE_SECONDS`, when set, replaces any value except `0`. */
  next?: ServerApiNextOptions;
  /** The path is a value of `API_ROOT_ENDPOINTS`, resolved against `appApiOrigin` instead of `appApiUrl` (API-3). */
  isRootPath?: boolean;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

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
function fetchOptionsOf(
  next: ServerApiNextOptions,
  overrideSeconds: number | undefined,
): RequestInit {
  const requested = next.revalidate ?? DEFAULT_REVALIDATE_SECONDS;
  const revalidate = requested === 0 ? 0 : (overrideSeconds ?? requested);
  if (revalidate === 0) return { cache: 'no-store' };
  return { next: { revalidate, ...(next.tags === undefined ? {} : { tags: next.tags }) } };
}

/** Why a call gave no answer; any HTTP status, 4xx and 5xx included, is an answer. Logged here, once. */
function failure(errorCode: ApiErrorCode, statusCode?: number): WebApiError {
  const error = new WebApiError({
    source: API_ERROR_SOURCES.CMS_API_REST,
    errorCode,
    statusCode,
    retryable: errorCode === API_ERROR_CODES.SERVER_API.TIMEOUT,
  });
  logApiError(error);
  return error;
}

function parseBody(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
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

function failureOf(error: unknown): WebApiError {
  const isTimeout = isAxiosError(error) && TIMEOUT_AXIOS_CODES.has(error.code);
  return failure(
    isTimeout ? API_ERROR_CODES.SERVER_API.TIMEOUT : API_ERROR_CODES.SERVER_API.NETWORK,
  );
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: ServerApiOptions<T> = {},
): Promise<T> {
  const { appApiUrl, appApiOrigin, revalidateOverrideSeconds } = getServerEnv();
  const baseUrl = options.isRootPath === true ? appApiOrigin : appApiUrl;
  let response: AxiosResponse;
  try {
    response = await http.request({
      url: `${baseUrl}${path}`,
      method,
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      ...(options.body === undefined ? {} : { data: options.body }),
      timeout: API_TIMEOUT_MS,
      fetchOptions: fetchOptionsOf(options.next ?? {}, revalidateOverrideSeconds),
    });
  } catch (error) {
    throw failureOf(error);
  }
  if (response.status >= REDIRECT_STATUS_MIN && response.status < HTTP_STATUS.BAD_REQUEST) {
    throw failure(API_ERROR_CODES.SERVER_API.REDIRECT, response.status);
  }
  const answer: ServerApiAnswer = {
    status: response.status,
    headers: headersOf(response),
    body: parseBody(response.data),
  };
  if (options.resolveData !== undefined) return options.resolveData(answer);
  if (response.status >= HTTP_STATUS.BAD_REQUEST) {
    throw failure(API_ERROR_CODES.SERVER_API.HTTP, response.status);
  }
  return answer.body as T;
}

type VerbCall = <T = unknown>(path: string, options?: ServerApiOptions<T>) => Promise<T>;

const verb =
  (method: HttpMethod): VerbCall =>
  (path, options) =>
    request(method, path, options);

/**
 * The one transport for cms-api calls made by the Next server (WEB-1). `path`
 * is a value of `API_ENDPOINTS` (or `API_ROOT_ENDPOINTS` with `isRootPath`). Does not know tokens: the caller sets headers.
 */
export const serverApi = {
  request,
  get: verb('GET'),
  post: verb('POST'),
  put: verb('PUT'),
  patch: verb('PATCH'),
  delete: verb('DELETE'),
  options: verb('OPTIONS'),
};

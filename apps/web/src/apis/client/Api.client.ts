import axios, { isAxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';

import {
  API_ERROR_CODES,
  API_ERROR_SOURCES,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import { BFF_BASE_PATH, BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { API_TIMEOUT_MS, HTTP_STATUS, RETRY_AFTER_HEADER } from '@/configs/Http.constants';
import { stripTrailingSlashes } from '@/configs/StripTrailingSlashes.rules';

import { retryAfterSecondsOf, webApiErrorOf } from './ClientApi.errors';

/** A route of this site's BFF, relative to `BFF_BASE_PATH`. */
export type BffPath = (typeof BFF_ENDPOINTS)[keyof typeof BFF_ENDPOINTS];

/** Per-call options; the base URL and the verb are fixed by the client. */
export type ClientApiOptions = Omit<AxiosRequestConfig, 'baseURL' | 'url' | 'method' | 'data'>;

export interface ClientApi {
  get<T>(path: BffPath, options?: ClientApiOptions): Promise<AxiosResponse<T>>;
  post<T>(path: BffPath, body?: unknown, options?: ClientApiOptions): Promise<AxiosResponse<T>>;
  put<T>(path: BffPath, body?: unknown, options?: ClientApiOptions): Promise<AxiosResponse<T>>;
  patch<T>(path: BffPath, body?: unknown, options?: ClientApiOptions): Promise<AxiosResponse<T>>;
  delete<T>(path: BffPath, options?: ClientApiOptions): Promise<AxiosResponse<T>>;
}

const instance = axios.create({ timeout: API_TIMEOUT_MS, baseURL: BFF_BASE_PATH });
instance.interceptors.request.use((config) => {
  if (config.url !== undefined) {
    config.url = stripTrailingSlashes(config.url);
  }
  return config;
});

const KNOWN_BFF_CODES: ReadonlySet<string> = new Set(Object.values(API_ERROR_CODES.BFF));

function bffCodeOf(data: unknown): ApiErrorCode | undefined {
  const errorCode = (data as { errorCode?: unknown } | null)?.errorCode;
  return typeof errorCode === 'string' && KNOWN_BFF_CODES.has(errorCode)
    ? (errorCode as ApiErrorCode)
    : undefined;
}

/**
 * Any failed call -> `WebApiError` (WEB-1, WEB-10): no answer is `client`, a BFF answer is `bff`
 * with its `{ statusCode, errorCode }` body. A 429 always reads as a rate limit, so the wait
 * is never lost. The error keeps codes and numbers only, never the body text.
 */
export function clientErrorOf(error: unknown): WebApiError {
  if (!isAxiosError(error)) return webApiErrorOf(error);
  const response = error.response;
  if (response === undefined) {
    return new WebApiError({
      source: API_ERROR_SOURCES.CLIENT,
      errorCode: API_ERROR_CODES.CLIENT.NETWORK,
      retryable: true,
    });
  }
  const bffCode = bffCodeOf(response.data);
  const isRateLimited = response.status === HTTP_STATUS.TOO_MANY_REQUESTS;
  const headers = response.headers as Record<string, unknown>;
  return new WebApiError({
    source: API_ERROR_SOURCES.BFF,
    errorCode: isRateLimited
      ? bffCode === API_ERROR_CODES.BFF.RATE_LIMITED
        ? bffCode
        : API_ERROR_CODES.CLIENT.RATE_LIMITED
      : (bffCode ?? API_ERROR_CODES.CLIENT.HTTP),
    statusCode: response.status,
    operation: error.config?.url,
    retryable: isRateLimited,
    retryAfterSeconds: isRateLimited ? retryAfterSecondsOf(headers[RETRY_AFTER_HEADER]) : undefined,
  });
}

instance.interceptors.response.use(undefined, (error: unknown) => {
  throw clientErrorOf(error);
});

/**
 * The browser's only API: the BFF of this site (ADR 0018). The base is fixed,
 * the browser holds no token, and there is no mock or cache option.
 */
export const clientApi: ClientApi = {
  get: (path, options) => instance.get(path, options),
  post: (path, body, options) => instance.post(path, body, options),
  put: (path, body, options) => instance.put(path, body, options),
  patch: (path, body, options) => instance.patch(path, body, options),
  delete: (path, options) => instance.delete(path, options),
};

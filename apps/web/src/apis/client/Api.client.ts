import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { BFF_BASE_PATH, BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { API_TIMEOUT_MS } from '@/configs/Http.constants';
import { stripTrailingSlashes } from '@/configs/StripTrailingSlashes.rules';

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

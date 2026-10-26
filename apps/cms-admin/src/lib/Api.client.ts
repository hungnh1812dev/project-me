import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';

import { appEnv } from '../config/App.env';
import { API_TIMEOUT_MS } from '../config/Http.constants';
import { stripTrailingSlashes } from '../config/StripTrailingSlashes.rules';

/** Offset paging of the list endpoints. `total` counts every row. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** Axios instance for cms-api. Every request path loses its trailing slash. */
export function createApiClient(
  baseURL: string,
  options: Omit<CreateAxiosDefaults, 'baseURL'> = {},
): AxiosInstance {
  const client = axios.create({ timeout: API_TIMEOUT_MS, ...options, baseURL });
  client.interceptors.request.use((config) => {
    if (config.url !== undefined) {
      config.url = stripTrailingSlashes(config.url);
    }
    return config;
  });
  return client;
}

// Cross-origin (admin.<domain> -> <domain>): send cookies, so a CORS setup
// without `Access-Control-Allow-Credentials` fails now, not at login (D14).
export const apiClient = createApiClient(appEnv.apiBaseUrl, {
  withCredentials: true,
});

import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';

import { appEnv } from '../config/env.client';
import { API_TIMEOUT_MS } from '../config/http.constants';
import { stripTrailingSlashes } from './strip-trailing-slashes';

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

// Sends the host-only refresh cookie (Path /api/v1/auth) with auth calls; the
// cookie is set by cms-api on this site's own origin (SPEC §6, D14).
export const apiClient = createApiClient(appEnv.apiBaseUrl, {
  withCredentials: true,
});

import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';

import { BFF_BASE_PATH } from '@/configs/Api.endpoints';
import { API_TIMEOUT_MS } from '@/configs/Http.constants';
import { stripTrailingSlashes } from '@/configs/StripTrailingSlashes.rules';

/** Axios instance for a JSON API. Every request path loses its trailing slash. */
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

/** The BFF of this site: the browser holds no token and calls no other API (ADR 0018). */
export const apiClient = createApiClient(BFF_BASE_PATH);

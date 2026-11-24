import { API_ROOT_ENDPOINTS } from '@configs/Api.endpoints';
import { appEnv } from '@configs/App.env';
import type { AxiosInstance } from 'axios';

export interface HealthResponse {
  status: string;
}

/** Absolute, so the client's API base URL is not prefixed. */
export const healthUrl = `${appEnv.apiOrigin}${API_ROOT_ENDPOINTS.HEALTH}`;

export const HEALTH_QUERY_KEYS = {
  live: ['health', 'live'],
} as const;

export function createHealthApi(client: AxiosInstance) {
  return {
    fetchLive: async (): Promise<HealthResponse> => {
      const response = await client.get<HealthResponse>(healthUrl);
      return response.data;
    },
  };
}

export type HealthApi = ReturnType<typeof createHealthApi>;

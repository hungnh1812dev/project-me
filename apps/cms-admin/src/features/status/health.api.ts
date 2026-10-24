import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';

export interface HealthResponse {
  status: string;
}

export const HEALTH_QUERY_KEYS = {
  live: ['health', 'live'],
} as const;

export function createHealthApi(client: AxiosInstance) {
  return {
    fetchLive: async (): Promise<HealthResponse> => {
      const response = await client.get<HealthResponse>(
        API_ENDPOINTS.HEALTH.LIVE,
      );
      return response.data;
    },
  };
}

export type HealthApi = ReturnType<typeof createHealthApi>;

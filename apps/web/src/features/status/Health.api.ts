import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { apiClient } from '../../lib/Api.client';

export interface HealthResponse {
  status: string;
}

export const HEALTH_QUERY_KEYS = {
  live: ['health', 'live'],
} as const;

export async function fetchLiveHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>(
    API_ENDPOINTS.HEALTH.LIVE,
  );
  return response.data;
}

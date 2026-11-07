import { apiClient } from '@/apis/client/Api.client';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';

export interface HealthResponse {
  status: string;
}

export const HEALTH_QUERY_KEYS = {
  live: ['health', 'live'],
} as const;

export async function fetchLiveHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>(BFF_ENDPOINTS.HEALTH);
  return response.data;
}

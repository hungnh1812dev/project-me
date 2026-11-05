import { cmsApiBrowserClient } from '../../apis/client/Api.client';
import { API_ENDPOINTS } from '../../configs/Api.endpoints';

export interface HealthResponse {
  status: string;
}

export const HEALTH_QUERY_KEYS = {
  live: ['health', 'live'],
} as const;

export async function fetchLiveHealth(): Promise<HealthResponse> {
  const response = await cmsApiBrowserClient.get<HealthResponse>(API_ENDPOINTS.HEALTH.LIVE);
  return response.data;
}

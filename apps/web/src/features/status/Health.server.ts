import 'server-only';

import { cmsApiClient } from '@/apis/server/restful/CmsApi.client';
import {
  CACHE_CONTROL_HEADER,
  CACHE_CONTROL_NO_STORE,
  HTTP_STATUS,
} from '@/configs/Http.constants';

const HEALTH_BODIES = {
  up: { status: 'ok' },
  down: { status: 'unavailable' },
} as const;

/** `GET /api/v1/health`: 200 `ok` while cms-api is live, 503 `unavailable` otherwise. */
export async function answerHealthRead(): Promise<Response> {
  const isLive = await cmsApiClient.readLiveHealth();
  return isLive
    ? Response.json(HEALTH_BODIES.up)
    : Response.json(HEALTH_BODIES.down, { status: HTTP_STATUS.SERVICE_UNAVAILABLE });
}

/** `GET` and `HEAD /health` (PS-8): 200 `ok` from this server alone, uncached; reads no request and writes no log. */
export function answerUptimeCheck(): Response {
  return Response.json(HEALTH_BODIES.up, {
    headers: { [CACHE_CONTROL_HEADER]: CACHE_CONTROL_NO_STORE },
  });
}

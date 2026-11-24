import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';

import {
  CheckReadinessService,
  HEALTH_STATUS,
  type HealthStatus,
} from '../application/CheckReadiness.service';

export const HEALTH_ROUTES = {
  ROOT: 'health',
  BARE: '',
  LIVE: 'live',
  READY: 'ready',
} as const;

export interface HealthResponse {
  status: HealthStatus;
}

/**
 * Probes return `{ status }` only, never internals (SPEC §6). Served at the root, outside `/api/v1` (API-3);
 * the bare `/health` answers exactly like `/health/live`.
 */
@Controller(HEALTH_ROUTES.ROOT)
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly checkReadiness: CheckReadinessService) {}

  @Get([HEALTH_ROUTES.BARE, HEALTH_ROUTES.LIVE])
  live(): HealthResponse {
    return { status: HEALTH_STATUS.OK };
  }

  @Get(HEALTH_ROUTES.READY)
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const { status, failureMessage } = await this.checkReadiness.check();
    if (status === HEALTH_STATUS.ERROR) {
      this.logger.warn(`Readiness DB ping failed: ${failureMessage}`);
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status };
  }
}

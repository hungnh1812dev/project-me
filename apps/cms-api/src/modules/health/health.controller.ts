import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { API_ROUTES } from '../../common/constants/api.constants';
import {
  HEALTH_STATUS,
  type HealthStatus,
  READINESS_DB_TIMEOUT_MS,
} from './health.constants';
import {
  DATABASE_HEALTH,
  type DatabaseHealth,
} from '../../infrastructure/database/database-health';

export interface HealthResponse {
  status: HealthStatus;
}

/** Probes return `{ status }` only, never internals (SPEC §6). */
@Controller(API_ROUTES.HEALTH.ROOT)
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealth,
  ) {}

  @Get(API_ROUTES.HEALTH.LIVE)
  live(): HealthResponse {
    return { status: HEALTH_STATUS.OK };
  }

  @Get(API_ROUTES.HEALTH.READY)
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    try {
      await this.database.ping(READINESS_DB_TIMEOUT_MS);
      return { status: HEALTH_STATUS.OK };
    } catch (error) {
      this.logger.warn(
        `Readiness DB ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: HEALTH_STATUS.ERROR };
    }
  }
}

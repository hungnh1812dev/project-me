import { Inject, Injectable } from '@nestjs/common';

import { DATABASE_HEALTH, type DatabaseHealth } from './DatabaseHealth.port';
import {
  HEALTH_STATUS,
  type HealthStatus,
  READINESS_DB_TIMEOUT_MS,
} from './Health.constants';

export interface ReadinessResult {
  status: HealthStatus;
  /** Set when `status` is `error`, for the caller's log; never part of a response. */
  failureMessage?: string;
}

@Injectable()
export class CheckReadinessService {
  constructor(
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealth,
  ) {}

  async check(): Promise<ReadinessResult> {
    try {
      await this.database.ping(READINESS_DB_TIMEOUT_MS);
      return { status: HEALTH_STATUS.OK };
    } catch (error) {
      return {
        status: HEALTH_STATUS.ERROR,
        failureMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

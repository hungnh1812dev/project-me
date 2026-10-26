import { Inject, Injectable } from '@nestjs/common';

export const HEALTH_STATUS = {
  OK: 'ok',
  ERROR: 'error',
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/** Upper bound for the readiness DB ping, so probes never hang. */
export const READINESS_DB_TIMEOUT_MS = 2_000;

/** DI token for the readiness check of the core database. */
export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');

/**
 * The only thing health needs from the database. `HealthModule` binds the
 * Prisma-backed adapter to `DATABASE_HEALTH`.
 */
export interface DatabaseHealth {
  /** Resolves when the DB answers a trivial query; rejects otherwise. */
  ping(timeoutMs: number): Promise<void>;
}

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

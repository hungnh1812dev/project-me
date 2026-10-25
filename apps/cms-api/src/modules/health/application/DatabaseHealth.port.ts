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

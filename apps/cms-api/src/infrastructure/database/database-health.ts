/** DI token for the readiness check of the core database. */
export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');

/**
 * The only thing health needs from the database layer. The implementation is
 * bound to `DATABASE_HEALTH` in `DatabaseModule` (Prisma-backed), so the health
 * module does not depend on it.
 */
export interface DatabaseHealth {
  /** Resolves when the DB answers a trivial query; rejects otherwise. */
  ping(timeoutMs: number): Promise<void>;
}

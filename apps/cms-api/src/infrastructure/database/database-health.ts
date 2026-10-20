/** DI token for the readiness check of the core database. */
export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');

/**
 * The only thing health needs from the database layer. T02 implements it
 * with a bare `pg` pool; T08 can rebind the token to a Prisma-backed
 * implementation without touching the health module.
 */
export interface DatabaseHealth {
  /** Resolves when the DB answers a trivial query; rejects otherwise. */
  ping(timeoutMs: number): Promise<void>;
}

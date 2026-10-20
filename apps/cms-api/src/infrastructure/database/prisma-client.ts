import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../generated/prisma/client';

export { PrismaClient };

/**
 * `@prisma/adapter-pg` over a `pg` pool we own (SPEC §3), so an idle-client
 * error cannot crash the process (the next query reports it) and the pool
 * can be closed explicitly.
 */
export function createPgAdapter(connectionString: string): {
  adapter: PrismaPg;
  pool: Pool;
} {
  const pool = new Pool({ connectionString });
  pool.on('error', () => undefined);
  return { adapter: new PrismaPg(pool), pool };
}

export interface PrismaHandle {
  prisma: PrismaClient;
  close: () => Promise<void>;
}

/** A standalone client for CLIs and tests. Call `close()` when done. */
export function openPrisma(connectionString: string): PrismaHandle {
  const { adapter, pool } = createPgAdapter(connectionString);
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    close: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

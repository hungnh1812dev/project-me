import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI config (Prisma 7 reads the connection here, not from the
 * schema). DATABASE_URL comes from the process environment only; no .env
 * file is loaded. `generate` needs no database, so the URL may be unset then.
 */
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/modules/identity/cli/seed.js',
  },
  ...(databaseUrl === undefined ? {} : { datasource: { url: databaseUrl } }),
});

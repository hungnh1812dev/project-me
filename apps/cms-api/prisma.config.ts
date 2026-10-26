import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI config (Prisma 7 reads the connection here, not from the
 * schema). The connection comes from DB_HOST, DB_PORT, DB_NAME, DB_USERNAME
 * and DB_PASSWORD in the process environment only; no .env file is loaded.
 * `generate` needs no database, so these may be unset then.
 *
 * Prisma's datasource takes a URL, so it is built with the URL API, which
 * percent-encodes the user name and password.
 */
const POSTGRES_DEFAULT_PORT = '5432';

function databaseUrlFromEnv(): string | undefined {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USERNAME || !DB_PASSWORD) return undefined;
  const url = new URL('postgresql://placeholder');
  url.hostname = DB_HOST;
  url.port = DB_PORT || POSTGRES_DEFAULT_PORT;
  url.username = DB_USERNAME;
  url.password = DB_PASSWORD;
  url.pathname = `/${encodeURIComponent(DB_NAME)}`;
  return url.toString();
}

const databaseUrl = databaseUrlFromEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/modules/identity/cli/Seed.command.js',
  },
  ...(databaseUrl === undefined ? {} : { datasource: { url: databaseUrl } }),
});

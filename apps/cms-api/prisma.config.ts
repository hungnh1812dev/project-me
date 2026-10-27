import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI config (Prisma 7 reads the connection here, not from the
 * schema). The connection comes from DB_HOST, DB_PORT, DB_NAME, DB_USERNAME
 * and DB_PASSWORD in the process environment only; no .env file is loaded.
 * `generate` needs no database, so these may be unset then.
 *
 * Prisma's datasource takes a URL, so it is built with the URL API, which
 * percent-encodes the user name and password.
 *
 * TLS (DB_SSL_MODE, DB_SSL_ROOT_CERT_PATH): the schema engine ignores
 * `sslmode=verify-full` (it connects like `require`, no check). Verified
 * TLS needs `sslmode=require` + `sslcert=<CA path>` + `sslaccept=strict`,
 * which checks the chain and the host name (proven against Postgres 17).
 * This file stays self-contained: the image copies it without `src/`.
 */
const POSTGRES_DEFAULT_PORT = '5432';

function applyTlsParameters(url: URL, env: NodeJS.ProcessEnv): void {
  const { DB_SSL_MODE: mode, DB_SSL_ROOT_CERT_PATH: rootCertPath } = env;
  if (!mode || mode === 'disable') return;
  if (mode === 'require') {
    url.searchParams.set('sslmode', 'require');
  } else if (mode === 'verify-full' && rootCertPath) {
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslcert', rootCertPath);
    url.searchParams.set('sslaccept', 'strict');
  } else {
    // Never fall back to an unverified connection.
    throw new Error(
      'DB_SSL_MODE must be disable, require or verify-full; verify-full also needs DB_SSL_ROOT_CERT_PATH',
    );
  }
}

function databaseUrlFromEnv(): string | undefined {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USERNAME || !DB_PASSWORD) return undefined;
  const url = new URL('postgresql://placeholder');
  url.hostname = DB_HOST;
  url.port = DB_PORT || POSTGRES_DEFAULT_PORT;
  url.username = DB_USERNAME;
  url.password = DB_PASSWORD;
  url.pathname = `/${encodeURIComponent(DB_NAME)}`;
  applyTlsParameters(url, process.env);
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

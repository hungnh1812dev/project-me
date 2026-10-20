function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${name} is not set. Run through \`SMOKE_E2E=1 pnpm smoke\` or see apps/e2e/README.md.`,
    );
  }
  return value;
}

/** The only reader of `process.env` in the e2e suite. See `.env.example`. */
export const e2eEnv = Object.freeze({
  /** Origin of cms-admin, e.g. `http://admin.domain.localhost:8080`. */
  adminUrl: requireEnv('E2E_ADMIN_URL'),
  /** Base URL of cms-api as the admin calls it, e.g. `http://domain.localhost:8080/api/v1`. */
  apiBaseUrl: requireEnv('E2E_API_BASE_URL'),
  ownerEmail: requireEnv('E2E_OWNER_EMAIL'),
  ownerPassword: requireEnv('E2E_OWNER_PASSWORD'),
  /** Set in CI to forbid `test.only` and retry once. */
  ci: process.env['CI'] !== undefined && process.env['CI'] !== '',
});

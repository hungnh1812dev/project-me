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
  /**
   * Dedicated 2FA account seeded by scripts/smoke.sh (T13), so the 2FA spec
   * never spends the owner's login budget (5 per email per 15 min).
   */
  twoFactorEmail: requireEnv('E2E_2FA_EMAIL'),
  twoFactorPassword: requireEnv('E2E_2FA_PASSWORD'),
  /** Mailpit (SMTP sink of the smoke stack), e.g. `http://mail.domain.localhost:8080`. */
  mailpitUrl: requireEnv('E2E_MAILPIT_URL'),
  /** Set in CI to forbid `test.only` and retry once. */
  ci: process.env['CI'] !== undefined && process.env['CI'] !== '',
});

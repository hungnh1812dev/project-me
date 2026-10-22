#!/usr/bin/env bash
# Shared by scripts/smoke.sh (compose) and scripts/e2e-stack.sh (docker run):
# the migration/owner log fragments, the e2e account seeding and the E2E_*
# export, so the two stacks never drift. Source it; do not run it.
#
# The caller defines these functions before calling the helpers below:
#   api_exec [docker exec options...] -- <command...>
#       runs a command inside the running cms-api container (stdin passes through)
#   pass <label> / fail <label>
#       report one check
# and sets (see stack_generate_credentials) the STACK_* credentials.

# Log lines of the cms-api init container (deploy:migrate, T37a).
DB_MIGRATE_APPLIED="All migrations have been successfully applied."
DB_MIGRATE_SEEDED="Seeded system roles: public, guest, reviewer, editor, admin, owner."
CONTENT_MIGRATE_APPLIED="Applied "
# cms-api package scripts run through npm inside the image (no pnpm there).
OWNER_BOOTSTRAP_CMD=(npm run --silent owner:bootstrap -- --password-stdin)
OWNER_CREATED="Owner account created: "

STACK_SECRET_BYTES="32"
SEED_2FA_ACCOUNT_DONE="Seeded e2e 2FA account"
# Creates a dedicated e2e account (T13): active, password from stdin, hashed
# with the app's own Argon2id parameters. Keeps the owner's 5-logins-per-15-min
# budget for the owner specs.
SEED_2FA_ACCOUNT_JS="
const { readFileSync } = require('node:fs');
const { openPrisma } = require('./dist/infrastructure/database/prisma-client');
const { hashPassword } = require('./dist/modules/identity/password-hasher');
(async () => {
  const passwordHash = await hashPassword(readFileSync(0, 'utf8').trim());
  const db = openPrisma({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  try {
    await db.prisma.account.create({
      data: {
        email: process.env.SEED_EMAIL,
        displayName: process.env.SEED_NAME || 'E2E 2FA',
        passwordHash,
        status: 'active',
        role: { connect: { slug: process.env.SEED_ROLE || 'admin' } },
        ...(process.env.SEED_EMAIL_2FA ? { is2faEnabled: true, twoFaMethod: 'email' } : {}),
      },
    });
  } finally {
    await db.close();
  }
  console.log('$SEED_2FA_ACCOUNT_DONE');
})().catch((error) => { console.error(error.message); process.exit(1); });
"

# The variables the Playwright suite reads (apps/e2e/src/env.ts).
E2E_VARS=(E2E_ADMIN_URL E2E_API_BASE_URL E2E_OWNER_EMAIL E2E_OWNER_PASSWORD E2E_MAILPIT_URL
  E2E_READER_EMAIL E2E_READER_PASSWORD E2E_READER_2FA_EMAIL E2E_READER_2FA_PASSWORD
  E2E_2FA_EMAIL E2E_2FA_PASSWORD)

stack_random_secret() { openssl rand -hex "$STACK_SECRET_BYTES"; }

# stack_generate_credentials <domain>: throwaway owner and e2e accounts for one run.
stack_generate_credentials() {
  local domain="$1"
  STACK_OWNER_EMAIL="owner@$domain"
  STACK_OWNER_PASSWORD="$(stack_random_secret)"
  STACK_2FA_EMAIL="e2e-2fa@$domain"
  STACK_2FA_PASSWORD="$(stack_random_secret)"
  STACK_READER_EMAIL="e2e-reader@$domain"
  STACK_READER_PASSWORD="$(stack_random_secret)"
  STACK_READER2FA_EMAIL="e2e-reader-2fa@$domain"
  STACK_READER2FA_PASSWORD="$(stack_random_secret)"
}

# stack_seed_account <password> [docker exec options...]: runs the seed script
# in cms-api and prints its output (the caller checks it). Options carry SEED_*.
stack_seed_account() {
  local password="$1"
  shift
  printf '%s\n' "$password" | api_exec "$@" -- node -e "$SEED_2FA_ACCOUNT_JS" 2>&1
}

# stack_seed_extra_accounts: the e2e 2FA account (admin) and the two reader
# accounts (guest; the second with email 2FA on).
stack_seed_extra_accounts() {
  local seed_output
  seed_output="$(stack_seed_account "$STACK_2FA_PASSWORD" -e SEED_EMAIL="$STACK_2FA_EMAIL")" || true
  if [[ "$seed_output" == *"$SEED_2FA_ACCOUNT_DONE"* && "$seed_output" != *"$STACK_2FA_PASSWORD"* ]]; then
    pass "seeds the e2e 2FA account"
  else
    fail "seeding the e2e 2FA account: ${seed_output//$STACK_2FA_PASSWORD/***}"
  fi
  if stack_seed_account "$STACK_READER_PASSWORD" -e SEED_ROLE=guest -e SEED_NAME=Reader \
    -e SEED_EMAIL="$STACK_READER_EMAIL" >/dev/null; then pass "seeds reader"; else fail "seeds reader"; fi
  if stack_seed_account "$STACK_READER2FA_PASSWORD" -e SEED_ROLE=guest -e SEED_NAME=Reader2fa \
    -e SEED_EMAIL_2FA=1 -e SEED_EMAIL="$STACK_READER2FA_EMAIL" >/dev/null; then pass "seeds reader 2fa"; else fail "seeds reader 2fa"; fi
}

# stack_export_e2e_env <admin origin> <api base url> <mailpit url>
stack_export_e2e_env() {
  export E2E_ADMIN_URL="$1" E2E_API_BASE_URL="$2" E2E_MAILPIT_URL="$3" \
    E2E_OWNER_EMAIL="$STACK_OWNER_EMAIL" E2E_OWNER_PASSWORD="$STACK_OWNER_PASSWORD" \
    E2E_READER_EMAIL="$STACK_READER_EMAIL" E2E_READER_PASSWORD="$STACK_READER_PASSWORD" \
    E2E_READER_2FA_EMAIL="$STACK_READER2FA_EMAIL" E2E_READER_2FA_PASSWORD="$STACK_READER2FA_PASSWORD" \
    E2E_2FA_EMAIL="$STACK_2FA_EMAIL" E2E_2FA_PASSWORD="$STACK_2FA_PASSWORD"
}

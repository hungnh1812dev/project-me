#!/usr/bin/env bash
# Used by scripts/smoke.sh (local compose stack): the migration/owner log
# fragments, the e2e account seeding and the E2E_* export. Source it; do not run it.
#
# The caller defines these functions before calling the helpers below:
#   api_exec [docker exec options...] -- <command...>
#       runs a command inside the running cms-api container (stdin passes through)
#   pass <label> / fail <label>
#       report one check
# and sets (see stack_generate_credentials) the STACK_* credentials.

# Log lines of the cms-api init container (deploy:migrate).
DB_MIGRATE_APPLIED="All migrations have been successfully applied."
DB_MIGRATE_SEEDED="Seeded system roles: public, guest, reviewer, editor, admin, owner."
CONTENT_MIGRATE_APPLIED="Applied "
# cms-api package scripts run through npm inside the image (no pnpm there).
OWNER_BOOTSTRAP_CMD=(npm run --silent owner:bootstrap -- --password-stdin)

STACK_SECRET_BYTES="32"
# Creates the dedicated e2e accounts with the cms-api `seed:account` CLI:
# active, password from stdin, hashed with the app's own Argon2id parameters,
# audited. The smoke-only opt-in is passed on each call, never in deployed config.
# Keeps the owner's 5-logins-per-15-min budget for the owner specs.
SEED_ACCOUNT_OPT_IN_ENV="ALLOW_ACCOUNT_SEED=smoke"
SEED_ACCOUNT_DONE="Seeded account:"

# The variables the Playwright suite reads (apps/e2e/src/env.ts).
E2E_VARS=(E2E_ADMIN_URL E2E_API_BASE_URL E2E_OWNER_EMAIL E2E_OWNER_PASSWORD E2E_MAILPIT_URL
  E2E_READER_EMAIL E2E_READER_PASSWORD E2E_READER_2FA_EMAIL E2E_READER_2FA_PASSWORD
  E2E_2FA_EMAIL E2E_2FA_PASSWORD E2E_DB_CONTAINER E2E_DB_USER E2E_DB_NAME)
DB_SERVICE="db"
DB_CONTAINER_NAME_FORMAT='{{.Name}}'

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
  STACK_READER_2FA_EMAIL="e2e-reader-2fa@$domain"
  STACK_READER_2FA_PASSWORD="$(stack_random_secret)"
}

# stack_seed_account <password> <seed:account options...>: runs the CLI in
# cms-api and prints its output (the caller checks it).
stack_seed_account() {
  local password="$1"
  shift
  printf '%s\n' "$password" | api_exec -e "$SEED_ACCOUNT_OPT_IN_ENV" -- \
    npm run --silent seed:account -- --password-stdin "$@" 2>&1
}

# stack_check_seed <label> <password> <seed:account options...>: reports one
# seed call; the password never reaches the report (output is redacted).
stack_check_seed() {
  local label="$1" password="$2" seed_output
  shift 2
  seed_output="$(stack_seed_account "$password" "$@")" || true
  if [[ "$seed_output" == *"$SEED_ACCOUNT_DONE"* && "$seed_output" != *"$password"* ]]; then
    pass "$label"
  else
    fail "$label: ${seed_output//$password/***}"
  fi
}

# stack_seed_extra_accounts: the e2e 2FA account (admin) and the two reader
# accounts (guest; the second with email 2FA on).
stack_seed_extra_accounts() {
  stack_check_seed "seeds the e2e 2FA account" "$STACK_2FA_PASSWORD" \
    --email "$STACK_2FA_EMAIL" --role admin
  stack_check_seed "seeds reader" "$STACK_READER_PASSWORD" \
    --email "$STACK_READER_EMAIL" --role guest
  stack_check_seed "seeds reader 2fa" "$STACK_READER_2FA_PASSWORD" \
    --email "$STACK_READER_2FA_EMAIL" --role guest --email-2fa
}

# stack_resolve_db_identity: the running db service's container name, user and
# database, read from compose (the service's own POSTGRES_* settings).
# Needs the caller's compose function.
stack_resolve_db_identity() {
  local container_id
  container_id="$(compose ps --quiet "$DB_SERVICE")"
  STACK_DB_CONTAINER="$(docker inspect --format "$DB_CONTAINER_NAME_FORMAT" "$container_id")"
  STACK_DB_CONTAINER="${STACK_DB_CONTAINER#/}"
  STACK_DB_USER="$(compose exec -T "$DB_SERVICE" printenv POSTGRES_USER)"
  STACK_DB_NAME="$(compose exec -T "$DB_SERVICE" printenv POSTGRES_DB)"
}

# stack_export_e2e_env <admin origin> <api base url> <mailpit url>: exports every
# name in E2E_VARS from the STACK_* variable of the same name (E2E_X <- STACK_X).
stack_export_e2e_env() {
  STACK_ADMIN_URL="$1" STACK_API_BASE_URL="$2" STACK_MAILPIT_URL="$3"
  local name source
  for name in "${E2E_VARS[@]}"; do
    source="STACK_${name#E2E_}"
    export "$name=${!source}"
  done
}

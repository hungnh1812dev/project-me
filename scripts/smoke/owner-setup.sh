# Smoke section: owner setup route, owner:bootstrap refusal and the CLI commands
# run again inside the cms-api image. Sourced by scripts/smoke.sh, which
# provides in_api.

DB_MIGRATE_CMD=(npm run --silent db:migrate)
RESET_2FA_CMD=(npm run --silent owner:reset-2fa --)
CONTENT_MIGRATE_CMD=(node dist/modules/content-engine/cli/ContentMigrate.command.js)
# The test setup token lives only in scripts/stack/cms-api.env (compose reads it
# from there); it is read from that file here and never printed.
CMS_API_ENV_FILE="$ROOT_DIR/scripts/stack/cms-api.env"
SETUP_TOKEN_KEY="OWNER_SETUP_TOKEN"
SETUP_STATUS_OPEN='"open":true'
SETUP_STATUS_CLOSED='"open":false'

# setup_body <token>: the owner setup request body (the owner credentials of this run).
setup_body() {
  printf '{"setupToken":"%s","email":"%s","displayName":"Owner","password":"%s"}' \
    "$1" "$STACK_OWNER_EMAIL" "$STACK_OWNER_PASSWORD"
}

# setup_status_is <fragment> <label>
setup_status_is() {
  request GET "$WEB_ORIGIN$API_PREFIX/setup/status"
  if [[ "$STATUS" == "200" && "$(cat "$BODY")" == *"$1"* ]]; then pass "$2"; else fail "$2: $STATUS $(cat "$BODY")"; fi
}

check_owner_setup() {
  echo "Owner setup route + owner:bootstrap refusal"
  local setup_token
  setup_token="$(sed -n "s/^$SETUP_TOKEN_KEY=//p" "$CMS_API_ENV_FILE")"
  if [[ -z "$setup_token" ]]; then fail "$SETUP_TOKEN_KEY is not set in $CMS_API_ENV_FILE"; fi
  setup_status_is "$SETUP_STATUS_OPEN" "setup status is open before the owner exists"
  request POST "$WEB_ORIGIN$API_PREFIX/setup/owner" -H 'Content-Type: application/json' \
    --data "$(setup_body "wrong-$setup_token")"
  expect_status "setup with a wrong token is refused" 401
  request POST "$WEB_ORIGIN$API_PREFIX/setup/owner" -H 'Content-Type: application/json' \
    --data "$(setup_body "$setup_token")"
  expect_status "setup with the right token creates the owner" 201
  if [[ -z "$(header Set-Cookie)" && "$(cat "$BODY")" != *accessToken* ]]; then pass "setup answer carries no cookie and no access token"; else fail "setup answer carries a session"; fi
  setup_status_is "$SETUP_STATUS_CLOSED" "setup status is closed after the owner exists"
  request POST "$WEB_ORIGIN$API_PREFIX/setup/owner" -H 'Content-Type: application/json' \
    --data "$(setup_body "$setup_token")"
  expect_status "a second setup submit is a 404" 404
  in_api "owner:bootstrap refuses a second owner" "$STACK_OWNER_PASSWORD" 0 \
    "$OWNER_EXISTS" -- "${OWNER_BOOTSTRAP_CMD[@]}"
}

check_migrations_again() {
  echo "Migrations again inside the cms-api image"
  in_api "db:migrate again has nothing pending" "" 1 \
    "$DB_MIGRATE_NOTHING" "$DB_SEED_NOTHING" -- "${DB_MIGRATE_CMD[@]}"
  stack_seed_extra_accounts
  # Break-glass 2FA reset: refusals only, so no account state changes
  # (the owner login and refresh checks below still pass).
  in_api "owner:reset-2fa refuses an unknown email" "" 0 \
    "$RESET_2FA_UNKNOWN" -- "${RESET_2FA_CMD[@]}" --email "nobody@$SMOKE_DOMAIN" --yes
  in_api "owner:reset-2fa refuses an account with 2FA off" "" 0 \
    "$RESET_2FA_NOT_ON" -- "${RESET_2FA_CMD[@]}" --email "$STACK_OWNER_EMAIL" --yes
  in_api "owner:reset-2fa needs --yes without a terminal" "" 0 \
    "$RESET_2FA_NO_TTY" -- "${RESET_2FA_CMD[@]}" --email "$STACK_OWNER_EMAIL"

  in_api "content:migrate again has nothing pending" "" 1 \
    "$CONTENT_MIGRATE_NOTHING" -- "${CONTENT_MIGRATE_CMD[@]}"
}

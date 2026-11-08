#!/usr/bin/env bash
# Used by scripts/smoke.sh (local compose stack): the e2e account seeding and
# the E2E_* export. Source it; do not run it. The expected output strings it
# checks (SEED_ACCOUNT_DONE) come from scripts/lib/expected-output.sh, which the
# caller sources.
#
# The caller defines these functions before calling the helpers below:
#   api_exec [docker exec options...] -- <command...>
#       runs a command inside the running cms-api container (stdin passes through)
#   pass <label> / fail <label>
#       report one check
# and sets (see stack_load_accounts) the STACK_* credentials.

# cms-api package scripts run through npm inside the image (no pnpm there).
OWNER_BOOTSTRAP_CMD=(npm run --silent owner:bootstrap -- --password-stdin)

STACK_SECRET_BYTES="32"
# Creates the dedicated e2e accounts with the cms-api `seed:account` CLI:
# active, password from stdin, hashed with the app's own Argon2id parameters,
# audited. The smoke-only opt-in is passed on each call, never in deployed config.
# Keeps the owner's 5-logins-per-15-min budget for the owner specs.
SEED_ACCOUNT_OPT_IN_ENV="ALLOW_ACCOUNT_SEED=smoke"

# The variables the Playwright suite reads (apps/e2e/src/E2e.env.ts).
E2E_VARS=(E2E_ADMIN_URL E2E_API_BASE_URL E2E_WEB_URL E2E_OWNER_EMAIL E2E_OWNER_PASSWORD E2E_MAILPIT_URL
  E2E_READER_EMAIL E2E_READER_PASSWORD E2E_READER_2FA_EMAIL E2E_READER_2FA_PASSWORD
  E2E_2FA_EMAIL E2E_2FA_PASSWORD E2E_DB_CONTAINER E2E_DB_USER E2E_DB_NAME)
DB_SERVICE="db"
DB_CONTAINER_NAME_FORMAT='{{.Name}}'

stack_random_secret() { openssl rand -hex "$STACK_SECRET_BYTES"; }

# The one list of long-lived stack account logins kept in .localEnv.agent.
STACK_ACCOUNT_KEYS=(STACK_OWNER_EMAIL STACK_OWNER_PASSWORD STACK_2FA_EMAIL STACK_2FA_PASSWORD
  STACK_READER_EMAIL STACK_READER_PASSWORD STACK_READER_2FA_EMAIL STACK_READER_2FA_PASSWORD)
LOCAL_ENV_FILE_MODE="600"
LOCAL_ENV_IGNORE_NAME=".localEnv.agent"

# stack_ensure_local_env_ignored <local env file>: exits unless the file is
# git-ignored and listed in the .dockerignore next to it.
stack_ensure_local_env_ignored() {
  local dir name
  dir="$(dirname "$1")"
  name="$(basename "$1")"
  git -C "$dir" check-ignore -q "$name" || { echo "$name is not git-ignored." >&2; exit 1; }
  grep -qxF "$name" "$dir/.dockerignore" || { echo "$name is not in .dockerignore." >&2; exit 1; }
}

# stack_default_account_email <key> <domain>: the email a missing *_EMAIL key gets.
stack_default_account_email() {
  local localpart
  case "$1" in
    STACK_OWNER_EMAIL) localpart="owner" ;;
    STACK_2FA_EMAIL) localpart="e2e-2fa" ;;
    STACK_READER_EMAIL) localpart="e2e-reader" ;;
    STACK_READER_2FA_EMAIL) localpart="e2e-reader-2fa" ;;
  esac
  echo "$localpart@$2"
}

# stack_load_accounts <domain> <local env file>: sets every STACK_ACCOUNT_KEYS
# variable from the file (read by name, never sourced). A missing key is
# generated and appended under one dated comment; an existing key is never
# rewritten. Prints key names only, never a value.
stack_load_accounts() {
  local domain="$1" file="$2" key value added=()
  stack_ensure_local_env_ignored "$file"
  [[ -f "$file" ]] || (umask 077 && : >"$file")
  chmod "$LOCAL_ENV_FILE_MODE" "$file"
  for key in "${STACK_ACCOUNT_KEYS[@]}"; do
    value="$(grep -m1 "^$key=" "$file" || true)"
    value="${value#"$key="}"
    if [[ -z "$value" ]]; then
      if [[ "$key" == *_EMAIL ]]; then value="$(stack_default_account_email "$key" "$domain")"; else value="$(stack_random_secret)"; fi
      if ((${#added[@]} == 0)); then
        printf '\n# %s: stack account logins added by %s (kept and reused on every stack start)\n' \
          "$(date +%F)" "$(basename "$0")" >>"$file"
      fi
      printf '%s=%s\n' "$key" "$value" >>"$file"
      added+=("$key")
    fi
    printf -v "$key" '%s' "$value"
  done
  if ((${#added[@]} > 0)); then echo "Added ${added[*]} to $(basename "$file")"; fi
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

# stack_export_e2e_env <admin origin> <api base url> <mailpit url> <web origin>: exports every
# name in E2E_VARS from the STACK_* variable of the same name (E2E_X <- STACK_X).
stack_export_e2e_env() {
  STACK_ADMIN_URL="$1" STACK_API_BASE_URL="$2" STACK_MAILPIT_URL="$3" STACK_WEB_URL="$4"
  local name source
  for name in "${E2E_VARS[@]}"; do
    source="STACK_${name#E2E_}"
    export "$name=${!source}"
  done
}

# ---------------------------------------------------------------------------
# Content API token for the web server (feature web-content-api, ADR 0020).
# Dev and smoke stacks only: the grant below exists in these scripts and
# nowhere else (no migration, seed CLI, cms-api default or deploy config).
#
# The caller sets STACK_API_URL (cms-api base URL with its /api/v1 prefix, on
# loopback), may set STACK_API_CURL_ARGS (extra curl arguments, e.g. --resolve),
# and passes its own compose project to stack_mint_content_token.
# No password, access token or API token is printed or put on a command line:
# bodies go through stdin, the Authorization header through a curl config read
# from a process substitution.
# ---------------------------------------------------------------------------
STACK_TOKEN_PROJECTS=(abyss-dev abyss-smoke)
STACK_TOKEN_ENV_KEY="STACK_APP_API_TOKEN"
STACK_TOKEN_NAME="web content (stack)"
STACK_TOKEN_SCOPE='{"permissions":[{"subject":"*","action":"read"}]}'
STACK_GRANT_ROLE_SLUG="guest"
STACK_GRANT_SUBJECT="api_tokens"
STACK_GRANT_ACTION="create"
STACK_MASKED_PATH="references.phone"
STACK_API_TIMEOUT_SECONDS=30
STACK_HTTP_STATUS_FORMAT='%{http_code}'
STACK_CONTENT_CHECK_QUERY='{"query":"{ cvPageList(pageSize: 1) { data { references { phone } _maskedFields } } }"}'

# stack_json_eval <json> <js expression over `data`>: prints the result (nothing for null).
stack_json_eval() {
  printf '%s' "$1" | STACK_JS="$2" node -e \
    'let body = ""; process.stdin.on("data", (chunk) => (body += chunk)).on("end", () => { const data = JSON.parse(body); const value = new Function("data", "return " + process.env.STACK_JS)(data); process.stdout.write(value === null || value === undefined ? "" : String(value)); })'
}

# stack_api_call <method> <path> <bearer or ""> [json body]: sets STACK_API_STATUS
# (000 when curl fails) and STACK_API_BODY.
stack_api_call() {
  local method="$1" path="$2" bearer="$3" body="${4:-}" response
  local args=(-sS --max-time "$STACK_API_TIMEOUT_SECONDS" -w "\n$STACK_HTTP_STATUS_FORMAT" -X "$method"
    ${STACK_API_CURL_ARGS[@]+"${STACK_API_CURL_ARGS[@]}"})
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' --data-binary @-); fi
  # The process substitution must sit in the curl command itself: its descriptor closes after it.
  if [[ -n "$bearer" ]]; then
    response="$(printf '%s' "$body" | curl "${args[@]}" -K <(printf 'header = "Authorization: Bearer %s"\n' "$bearer") \
      "$STACK_API_URL$path" 2>/dev/null)" || response=$'\n000'
  else
    response="$(printf '%s' "$body" | curl "${args[@]}" "$STACK_API_URL$path" 2>/dev/null)" || response=$'\n000'
  fi
  STACK_API_STATUS="${response##*$'\n'}"
  STACK_API_BODY="${response%$'\n'*}"
}

# stack_sign_in <email> <password>: prints the access token; nothing and status 1 on failure.
stack_sign_in() {
  local login_json access_token
  login_json="$(STACK_EMAIL="$1" STACK_PASSWORD="$2" node -e \
    'process.stdout.write(JSON.stringify({ email: process.env.STACK_EMAIL, password: process.env.STACK_PASSWORD }))')"
  stack_api_call POST /auth/login "" "$login_json"
  [[ "$STACK_API_STATUS" == 2* ]] || return 1
  access_token="$(stack_json_eval "$STACK_API_BODY" 'data.accessToken')"
  [[ -n "$access_token" ]] || return 1
  printf '%s' "$access_token"
}

# stack_content_token_reads_cv_pages <api token>: sets STACK_API_STATUS and STACK_API_BODY
# for the GraphQL read that proves the token authenticates.
stack_content_token_reads_cv_pages() {
  stack_api_call POST /graphql "$1" "$STACK_CONTENT_CHECK_QUERY"
  [[ "$STACK_API_STATUS" == 2* ]]
}

# stack_store_local_env_value <file> <key> <value>: sets the key in the file,
# replacing a stale line (mode 600, value never printed).
stack_store_local_env_value() {
  local file="$1" key="$2" value="$3" kept
  kept="$(grep -v "^$key=" "$file" || true)"
  (
    umask 077
    { [[ -z "$kept" ]] || printf '%s\n' "$kept"; printf '%s=%s\n' "$key" "$value"; } >"$file"
  )
  chmod "$LOCAL_ENV_FILE_MODE" "$file"
}

# stack_guest_role_rows <owner token>: sets STACK_GUEST_ROLE_ID and STACK_GUEST_ROWS (the
# guest permission rows without any api_tokens row, as a PUT body list).
stack_guest_role_rows() {
  stack_api_call GET /roles "$1"
  [[ "$STACK_API_STATUS" == 2* ]] || { echo "Content token: GET /roles answered HTTP $STACK_API_STATUS." >&2; return 1; }
  STACK_GUEST_ROLE_ID="$(stack_json_eval "$STACK_API_BODY" \
    "data.data.find((role) => role.slug === '$STACK_GRANT_ROLE_SLUG').id")"
  STACK_GUEST_ROWS="$(stack_json_eval "$STACK_API_BODY" \
    "JSON.stringify(data.data.find((role) => role.slug === '$STACK_GRANT_ROLE_SLUG').permissions.filter((row) => row.subject !== '$STACK_GRANT_SUBJECT').map(({ subject, action, readableFields, writableFields, conditions }) => ({ subject, action, readableFields, writableFields, conditions })))")"
  [[ -n "$STACK_GUEST_ROLE_ID" && -n "$STACK_GUEST_ROWS" ]]
}

# stack_put_guest_rows <owner token> <rows json>: replaces the guest permission rows.
stack_put_guest_rows() {
  stack_api_call PUT "/roles/$STACK_GUEST_ROLE_ID/permissions" "$1" "{\"permissions\":$2}"
  [[ "$STACK_API_STATUS" == 2* ]]
}

# stack_guest_holds_no_grant <owner token>: true when the guest role has no api_tokens row.
stack_guest_holds_no_grant() {
  stack_api_call GET /roles "$1"
  [[ "$STACK_API_STATUS" == 2* ]] || return 1
  [[ "$(stack_json_eval "$STACK_API_BODY" \
    "data.data.find((role) => role.slug === '$STACK_GRANT_ROLE_SLUG').permissions.some((row) => row.subject === '$STACK_GRANT_SUBJECT')")" == "false" ]]
}

# stack_mint_with_temporary_grant <owner token>: gives guest api_tokens:create, mints the
# token as the reader account, always puts the guest rows back. Sets STACK_MINTED_TOKEN.
stack_mint_with_temporary_grant() {
  local owner_token="$1" reader_token mint_status=0
  stack_guest_role_rows "$owner_token" || { echo "Content token: reading the guest role failed." >&2; return 1; }
  local original_rows="$STACK_GUEST_ROWS"
  local granted_rows
  granted_rows="$(STACK_ROWS="$original_rows" STACK_SUBJECT="$STACK_GRANT_SUBJECT" STACK_ACTION="$STACK_GRANT_ACTION" node -e \
    'const rows = JSON.parse(process.env.STACK_ROWS); rows.push({ subject: process.env.STACK_SUBJECT, action: process.env.STACK_ACTION, readableFields: null, writableFields: null, conditions: null }); process.stdout.write(JSON.stringify(rows))')"
  if ! stack_put_guest_rows "$owner_token" "$granted_rows"; then
    echo "Content token: granting api_tokens to the guest role failed (HTTP $STACK_API_STATUS)." >&2
    stack_put_guest_rows "$owner_token" "$original_rows" || true
    return 1
  fi
  if reader_token="$(stack_sign_in "$STACK_READER_EMAIL" "$STACK_READER_PASSWORD")"; then
    stack_api_call POST /api-tokens "$reader_token" \
      "{\"name\":\"$STACK_TOKEN_NAME\",\"scope\":$STACK_TOKEN_SCOPE}"
    if [[ "$STACK_API_STATUS" == 2* ]]; then
      STACK_MINTED_TOKEN="$(stack_json_eval "$STACK_API_BODY" 'data.token')"
      [[ -n "$STACK_MINTED_TOKEN" ]] || mint_status=1
    else
      echo "Content token: creating the API token failed (HTTP $STACK_API_STATUS)." >&2
      mint_status=1
    fi
  else
    echo "Content token: reader sign-in failed." >&2
    mint_status=1
  fi
  # Revoke on every path, success or not.
  if ! stack_put_guest_rows "$owner_token" "$original_rows" || ! stack_guest_holds_no_grant "$owner_token"; then
    echo "Content token: the guest role still holds $STACK_GRANT_SUBJECT after the revoke." >&2
    return 1
  fi
  return "$mint_status"
}

# stack_check_masked_profile <api token>: the token must read through the public profile,
# so references.phone is listed in _maskedFields of a cvPage. With no published cvPage
# the list is empty (masking is reported per record), so the check says so and skips.
stack_check_masked_profile() {
  local record_count masked
  stack_content_token_reads_cv_pages "$1" || { echo "Start check 'cvPageList with the content token': HTTP $STACK_API_STATUS." >&2; return 1; }
  record_count="$(stack_json_eval "$STACK_API_BODY" 'data.data.cvPageList.data.length')"
  if [[ "$record_count" == "0" ]]; then
    echo "Start check 'cvPageList masks $STACK_MASKED_PATH': skipped, no published cvPage yet."
    return 0
  fi
  masked="$(stack_json_eval "$STACK_API_BODY" "data.data.cvPageList.data[0]._maskedFields.includes('$STACK_MASKED_PATH')")"
  [[ "$masked" == "true" ]] || { echo "Start check 'cvPageList masks $STACK_MASKED_PATH' failed: the content token reads wider than the public profile." >&2; return 1; }
}

# stack_drop_leftover_grant <owner token>: removes an api_tokens row a killed run left on guest.
stack_drop_leftover_grant() {
  stack_guest_role_rows "$1" || return 1
  stack_guest_holds_no_grant "$1" && return 0
  echo "Content token: removing a leftover $STACK_GRANT_SUBJECT grant from the guest role."
  stack_put_guest_rows "$1" "$STACK_GUEST_ROWS" && stack_guest_holds_no_grant "$1"
}

# stack_api_url_is_local: true when STACK_API_URL points at loopback or *.localhost.
stack_api_url_is_local() {
  local host="${STACK_API_URL#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  [[ "$host" == "127.0.0.1" || "$host" == "localhost" || "$host" == *.localhost ]]
}

# stack_mint_content_token <compose project> <local env file>: sets and exports
# STACK_APP_API_TOKEN (kept in the local env file and reused while it authenticates).
# Needs the stack accounts (stack_load_accounts, seeded) and a running cms-api.
stack_mint_content_token() {
  local project="$1" file="$2" known="" project_allowed=0 name owner_token
  for name in "${STACK_TOKEN_PROJECTS[@]}"; do [[ "$name" == "$project" ]] && project_allowed=1; done
  ((project_allowed)) || { echo "Content token: refused for compose project '$project'." >&2; return 1; }
  stack_api_url_is_local || { echo "Content token: refused, STACK_API_URL is not a local address." >&2; return 1; }
  stack_ensure_local_env_ignored "$file"
  known="$(grep -m1 "^$STACK_TOKEN_ENV_KEY=" "$file" || true)"
  known="${known#"$STACK_TOKEN_ENV_KEY="}"
  owner_token="$(stack_sign_in "$STACK_OWNER_EMAIL" "$STACK_OWNER_PASSWORD")" \
    || { echo "Content token: owner sign-in failed." >&2; return 1; }
  stack_drop_leftover_grant "$owner_token" || { echo "Content token: the guest role could not be checked or cleaned." >&2; return 1; }
  if [[ -n "$known" ]] && stack_content_token_reads_cv_pages "$known"; then
    echo "Content token: reusing $STACK_TOKEN_ENV_KEY."
  else
    stack_mint_with_temporary_grant "$owner_token" || return 1
    known="$STACK_MINTED_TOKEN"
    stack_store_local_env_value "$file" "$STACK_TOKEN_ENV_KEY" "$known"
    echo "Content token: minted and stored as $STACK_TOKEN_ENV_KEY in $(basename "$file")."
  fi
  stack_check_masked_profile "$known" || return 1
  printf -v "$STACK_TOKEN_ENV_KEY" '%s' "$known"
}

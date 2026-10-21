#!/usr/bin/env bash
# Proxy smoke test (T04): builds and starts docker-compose.smoke.yml, checks
# routing, trailing slashes and CORS through Traefik, runs db:migrate,
# owner:bootstrap (T08) and content:migrate (T07) inside the cms-api image,
# checks login/refresh (T09) and OTP mail delivery to Mailpit (T12), then
# tears it down.
#
# Optional env:
#   SMOKE_DOMAIN           base domain (default domain.localhost)
#   SMOKE_HTTP_PORT        host port Traefik listens on (default 8080)
#   SMOKE_TIMEOUT_SECONDS  how long to wait for the stack (default 180)
#   SMOKE_KEEP=1           leave the stack running afterwards (for browser checks)
#   SMOKE_E2E=1            also run the Playwright suite (@abyss/e2e) against the
#                          stack as the bootstrapped owner (T11)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.smoke.yml"
DEFAULT_DOMAIN="domain.localhost"
DEFAULT_HTTP_PORT="8080"
DEFAULT_TIMEOUT_SECONDS="180"
HTTP_DEFAULT_PORT="80"
SECRET_BYTES="32"
POLL_INTERVAL_SECONDS="2"
LOOPBACK="127.0.0.1"
API_PREFIX="/api/v1"
# Web (Next.js) routing checks: a path that never exists, and the same path
# with a trailing slash (Next.js redirects before routing: 308 to the slashless form).
WEB_UNKNOWN_PATH="/this-page-does-not-exist"
WEB_SLASH_PATH="$WEB_UNKNOWN_PATH/"
HEALTH_OK_BODY='"status":"ok"'
# cms-api package scripts run through npm inside the image (no pnpm there).
DB_MIGRATE_CMD=(npm run --silent db:migrate)
DB_MIGRATE_APPLIED="All migrations have been successfully applied."
DB_MIGRATE_SEEDED="Seeded system roles: public, guest, reviewer, editor, admin, owner."
DB_MIGRATE_NOTHING="No pending migrations to apply."
DB_SEED_NOTHING="System roles already seeded."
OWNER_BOOTSTRAP_CMD=(npm run --silent owner:bootstrap -- --password-stdin)
OWNER_CREATED="Owner account created: "
OWNER_EXISTS="An owner account already exists."
RESET_2FA_CMD=(npm run --silent owner:reset-2fa --)
RESET_2FA_UNKNOWN="No account with this email."
RESET_2FA_NOT_ON="Two-factor authentication is not on for this account."
RESET_2FA_NO_TTY="No terminal for the confirmation prompt."
CONTENT_MIGRATE_CMD=(node dist/modules/content-engine/cli/migrate.js)
CONTENT_MIGRATE_APPLIED="Applied "
CONTENT_MIGRATE_NOTHING="No pending content migrations."
REFRESH_COOKIE_NAME="__Secure-abyss_rt"
JWT_ACCESS_KID="smoke"
TOTP_ENC_KID="smoke-totp"
SEED_2FA_ACCOUNT_DONE="Seeded e2e 2FA account"
# Creates the dedicated e2e 2FA account (T13): active admin, password from
# stdin, hashed with the app's own Argon2id parameters. Keeps the owner's
# 5-logins-per-15-min budget for the owner specs.
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
        displayName: 'E2E 2FA',
        passwordHash,
        status: 'active',
        role: { connect: { slug: 'admin' } },
      },
    });
  } finally {
    await db.close();
  }
  console.log('$SEED_2FA_ACCOUNT_DONE');
})().catch((error) => { console.error(error.message); process.exit(1); });
"
RESET_MAIL_SUBJECT="Your Abyss CMS password reset code"
MAIL_POLL_ATTEMPTS="15"

export SMOKE_DOMAIN="${SMOKE_DOMAIN:-$DEFAULT_DOMAIN}"
export SMOKE_HTTP_PORT="${SMOKE_HTTP_PORT:-$DEFAULT_HTTP_PORT}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"

ADMIN_HOST="admin.$SMOKE_DOMAIN"
MAIL_HOST="mail.$SMOKE_DOMAIN"
PORT_SUFFIX=""
if [[ "$SMOKE_HTTP_PORT" != "$HTTP_DEFAULT_PORT" ]]; then
  PORT_SUFFIX=":$SMOKE_HTTP_PORT"
fi
WEB_ORIGIN="http://$SMOKE_DOMAIN$PORT_SUFFIX"
ADMIN_ORIGIN="http://$ADMIN_HOST$PORT_SUFFIX"
MAILPIT_URL="http://$MAIL_HOST$PORT_SUFFIX"
OTHER_ORIGIN="http://not-allowed.$SMOKE_DOMAIN$PORT_SUFFIX"
export SMOKE_ADMIN_ORIGIN="$ADMIN_ORIGIN"
export SMOKE_WEB_ORIGIN="$WEB_ORIGIN"
export SMOKE_JWT_ACCESS_KID="$JWT_ACCESS_KID"
export SMOKE_TOTP_ENC_KID="$TOTP_ENC_KID"
export SMOKE_API_BASE_URL="$WEB_ORIGIN$API_PREFIX"

# Throwaway values for this run only (production mode needs them).
random_secret() { openssl rand -hex "$SECRET_BYTES"; }
export SMOKE_DB_PASSWORD="$(random_secret)"
export SMOKE_JWT_ACCESS_SECRET="$(random_secret)"
export SMOKE_OTP_PEPPER="$(random_secret)"
export SMOKE_TOTP_ENC_KEY="$(random_secret)"
SMOKE_OWNER_EMAIL="owner@$SMOKE_DOMAIN"
SMOKE_OWNER_PASSWORD="$(random_secret)"
SMOKE_2FA_EMAIL="e2e-2fa@$SMOKE_DOMAIN"
SMOKE_2FA_PASSWORD="$(random_secret)"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

WORK_DIR="$(mktemp -d)"
cleanup() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    echo "--- cms-api logs ---" >&2
    compose logs --no-color --tail 50 cms-api >&2 || true
  fi
  if [[ "${SMOKE_KEEP:-}" == "1" ]]; then
    echo "SMOKE_KEEP=1: stack left running. Stop it with: docker compose -p abyss-smoke down -v"
  else
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
  exit "$code"
}
trap cleanup EXIT

FAILURES=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1" >&2; FAILURES=$((FAILURES + 1)); }

# request <method> <url> [curl args...]; sets STATUS, HEADERS file and BODY file.
# --resolve pins both hosts to loopback, so no /etc/hosts entry is needed.
request() {
  local method="$1" url="$2"
  shift 2
  HEADERS="$WORK_DIR/headers" BODY="$WORK_DIR/body"
  STATUS="$(curl -sS -o "$BODY" -D "$HEADERS" -w '%{http_code}' \
    --resolve "$SMOKE_DOMAIN:$SMOKE_HTTP_PORT:$LOOPBACK" \
    --resolve "$ADMIN_HOST:$SMOKE_HTTP_PORT:$LOOPBACK" \
    --resolve "$MAIL_HOST:$SMOKE_HTTP_PORT:$LOOPBACK" \
    -X "$method" "$@" "$url" || echo "000")"
}

# header <name>: value of a response header from the last request ("" if absent).
header() {
  awk -v name="$(echo "$1" | tr '[:upper:]' '[:lower:]')" -F': ' '
    { key = tolower($1) }
    key == name { sub(/\r$/, "", $2); print $2; exit }
  ' "$HEADERS"
}

expect_status() {
  local label="$1" expected="$2"
  if [[ "$STATUS" == "$expected" ]]; then pass "$label ($STATUS)"; else fail "$label: expected $expected, got $STATUS"; fi
}

expect_header() {
  local label="$1" name="$2" expected="$3" actual
  actual="$(header "$name")"
  if [[ "$actual" == "$expected" ]]; then pass "$label"; else fail "$label: $name expected '$expected', got '$actual'"; fi
}

echo "Building and starting the smoke stack ($WEB_ORIGIN, $ADMIN_ORIGIN)..."
compose up --build --detach --wait --wait-timeout "$TIMEOUT_SECONDS"

echo "Waiting for the API behind the proxy..."
deadline=$((SECONDS + TIMEOUT_SECONDS))
# Traefik only routes a container once it reports healthy; until then /api
# falls through to the web SPA (200 + HTML), so wait for the JSON body.
api_ready() {
  request GET "$WEB_ORIGIN$API_PREFIX/health/ready"
  [[ "$STATUS" == "200" ]] && grep -q "$HEALTH_OK_BODY" "$BODY"
}
until api_ready; do
  if ((SECONDS >= deadline)); then
    echo "Timed out waiting for $WEB_ORIGIN$API_PREFIX/health/ready (last status $STATUS)" >&2
    exit 1
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

echo "Routing"
request GET "$WEB_ORIGIN/"
expect_status "web /" 200
# Next.js, not an SPA: an unknown path is a real 404, never a 3xx or 200 fallback.
request GET "$WEB_ORIGIN$WEB_UNKNOWN_PATH"
expect_status "web unknown path is a 404 (no SPA fallback)" 404
# Trailing-slash page: Next.js answers 308 with a relative Location (never the
# container's own http://<host>:<port> URL).
request GET "$WEB_ORIGIN$WEB_SLASH_PATH"
expect_status "web page with a trailing slash redirects" 308
web_location="$(header Location)"
if [[ "$web_location" == "$WEB_UNKNOWN_PATH" ]]; then
  pass "web redirect Location is relative ($web_location)"
else
  fail "web redirect Location: expected '$WEB_UNKNOWN_PATH', got '$web_location'"
fi
# A hashed build asset is cached as immutable.
request GET "$WEB_ORIGIN/"
web_asset="$(grep -oE '/_next/static/[^"]+\.(js|css)' "$BODY" | head -n 1 || true)"
if [[ -z "$web_asset" ]]; then
  fail "web home page references no /_next/static asset"
else
  request GET "$WEB_ORIGIN$web_asset"
  expect_status "web static asset $web_asset" 200
  if [[ "$(header Cache-Control)" == *immutable* ]]; then pass "web static asset is cached as immutable"; else fail "web static asset Cache-Control: '$(header Cache-Control)'"; fi
fi
request GET "$ADMIN_ORIGIN/"
expect_status "admin SPA /" 200
request GET "$ADMIN_ORIGIN/accounts/settings"
expect_status "admin SPA fallback for a client route" 200

echo "Health through the proxy"
request GET "$WEB_ORIGIN$API_PREFIX/health/ready"
expect_status "GET health/ready" 200
if grep -q "$HEALTH_OK_BODY" "$BODY"; then pass "health/ready body is {status: ok}"; else fail "health/ready body: $(cat "$BODY")"; fi

echo "Trailing slashes (SPEC §12-17: never 3xx)"
request GET "$WEB_ORIGIN$API_PREFIX/health/live/"
expect_status "GET health/live/ with trailing slash" 200
request POST "$WEB_ORIGIN$API_PREFIX/health/live/" -H 'Content-Type: application/json' --data '{}'
if [[ "$STATUS" =~ ^3 || "$STATUS" == "000" ]]; then
  fail "POST with trailing slash returned $STATUS"
else
  pass "POST with trailing slash is not a redirect ($STATUS)"
fi

echo "CORS admin -> API"
request OPTIONS "$WEB_ORIGIN$API_PREFIX/health/live" \
  -H "Origin: $ADMIN_ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
expect_status "preflight" 204
expect_header "preflight allows the admin origin" Access-Control-Allow-Origin "$ADMIN_ORIGIN"
expect_header "preflight allows credentials" Access-Control-Allow-Credentials "true"

request GET "$WEB_ORIGIN$API_PREFIX/health/live" -H "Origin: $ADMIN_ORIGIN"
expect_status "actual cross-origin call" 200
expect_header "actual call allows the admin origin" Access-Control-Allow-Origin "$ADMIN_ORIGIN"
expect_header "actual call allows credentials" Access-Control-Allow-Credentials "true"
expect_header "actual call exposes the request id and Retry-After (T11)" Access-Control-Expose-Headers "x-request-id,Retry-After"

request GET "$WEB_ORIGIN$API_PREFIX/health/live" -H "Origin: $OTHER_ORIGIN"
expect_header "another origin gets no Access-Control-Allow-Origin" Access-Control-Allow-Origin ""

# in_api <label> <stdin text> <expect success: 1|0> <expected fragments...> -- <command...>
# Runs a command in the cms-api container; output must contain every fragment.
in_api() {
  local label="$1" input="$2" want_ok="$3" output ok=1 fragment
  shift 3
  local fragments=()
  while [[ "$1" != "--" ]]; do fragments+=("$1"); shift; done
  shift
  output="$(printf '%s\n' "$input" | compose exec -T -e OWNER_EMAIL="$SMOKE_OWNER_EMAIL" cms-api "$@" 2>&1)" || ok=0
  if [[ "$ok" != "$want_ok" ]]; then fail "$label: exit status mismatch: $output"; return; fi
  for fragment in "${fragments[@]}"; do
    if [[ "$output" != *"$fragment"* ]]; then fail "$label: missing '$fragment' in: $output"; return; fi
  done
  if [[ "$output" == *"$SMOKE_OWNER_PASSWORD"* ]]; then fail "$label: output contains the password"; return; fi
  pass "$label"
}

echo "db:migrate + owner:bootstrap inside the cms-api image"
in_api "db:migrate applies core migrations and seeds roles" "" 1 \
  "$DB_MIGRATE_APPLIED" "$DB_MIGRATE_SEEDED" -- "${DB_MIGRATE_CMD[@]}"
in_api "db:migrate again has nothing pending" "" 1 \
  "$DB_MIGRATE_NOTHING" "$DB_SEED_NOTHING" -- "${DB_MIGRATE_CMD[@]}"
in_api "owner:bootstrap creates the owner" "$SMOKE_OWNER_PASSWORD" 1 \
  "$OWNER_CREATED$SMOKE_OWNER_EMAIL" -- "${OWNER_BOOTSTRAP_CMD[@]}"
in_api "owner:bootstrap refuses a second owner" "$SMOKE_OWNER_PASSWORD" 0 \
  "$OWNER_EXISTS" -- "${OWNER_BOOTSTRAP_CMD[@]}"
seed_output="$(printf '%s\n' "$SMOKE_2FA_PASSWORD" | compose exec -T -e SEED_EMAIL="$SMOKE_2FA_EMAIL" cms-api node -e "$SEED_2FA_ACCOUNT_JS" 2>&1)" || true
if [[ "$seed_output" == *"$SEED_2FA_ACCOUNT_DONE"* && "$seed_output" != *"$SMOKE_2FA_PASSWORD"* ]]; then
  pass "seeds the e2e 2FA account"
else
  fail "seeding the e2e 2FA account: $seed_output"
fi
# Break-glass 2FA reset (T13a): refusals only, so no account state changes
# (the owner login and refresh checks below still pass).
in_api "owner:reset-2fa refuses an unknown email" "" 0 \
  "$RESET_2FA_UNKNOWN" -- "${RESET_2FA_CMD[@]}" --email "nobody@$SMOKE_DOMAIN" --yes
in_api "owner:reset-2fa refuses an account with 2FA off" "" 0 \
  "$RESET_2FA_NOT_ON" -- "${RESET_2FA_CMD[@]}" --email "$SMOKE_OWNER_EMAIL" --yes
in_api "owner:reset-2fa needs --yes without a terminal" "" 0 \
  "$RESET_2FA_NO_TTY" -- "${RESET_2FA_CMD[@]}" --email "$SMOKE_OWNER_EMAIL"

echo "content:migrate inside the cms-api image"
in_api "first run applies the committed migrations" "" 1 \
  "$CONTENT_MIGRATE_APPLIED" -- "${CONTENT_MIGRATE_CMD[@]}"
in_api "second run has nothing pending" "" 1 \
  "$CONTENT_MIGRATE_NOTHING" -- "${CONTENT_MIGRATE_CMD[@]}"

echo "Auth through the proxy (T09)"
login_body() { printf '{"email":"%s","password":"%s"}' "$SMOKE_OWNER_EMAIL" "$1"; }
request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
  --data "$(login_body "$SMOKE_OWNER_PASSWORD")"
expect_status "POST auth/login/ with trailing slash, right password (SPEC §12-17)" 200
refresh_cookie="$(header Set-Cookie | sed -n "s/^\($REFRESH_COOKIE_NAME=[^;]*\);.*/\1/p")"
if [[ -n "$refresh_cookie" ]]; then pass "login sets the refresh cookie"; else fail "login sets no refresh cookie"; fi
request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
  --data "$(login_body "wrong-$SMOKE_OWNER_PASSWORD")"
expect_status "POST auth/login/ with trailing slash, wrong password (SPEC §12-17)" 401
request POST "$WEB_ORIGIN$API_PREFIX/auth/refresh" -H "Cookie: $refresh_cookie"
expect_status "refresh without Origin is refused" 403
request POST "$WEB_ORIGIN$API_PREFIX/auth/refresh" -H "Cookie: $refresh_cookie" -H "Origin: $ADMIN_ORIGIN"
expect_status "refresh from the admin origin rotates the token" 200
request POST "$WEB_ORIGIN$API_PREFIX/auth/register" -H 'Content-Type: application/json' --data '{}'
expect_status "POST auth/register does not exist (SPEC §12-2)" 404

echo "Two-factor endpoints (T13)"
request POST "$WEB_ORIGIN$API_PREFIX/auth/2fa/totp/setup"
expect_status "2fa/totp/setup needs a Bearer token" 401
request POST "$WEB_ORIGIN$API_PREFIX/auth/2fa/verify" -H 'Content-Type: application/json' \
  --data '{"tempToken":"forged","code":"123456"}'
expect_status "2fa/verify rejects a forged temp token" 401

echo "Password reset mail through SMTP to Mailpit (T12)"
request POST "$WEB_ORIGIN$API_PREFIX/auth/password/request-otp" -H 'Content-Type: application/json' \
  --data "$(printf '{"email":"%s"}' "$SMOKE_OWNER_EMAIL")"
expect_status "request-otp answers 202" 202
request POST "$WEB_ORIGIN$API_PREFIX/auth/password/request-otp" -H 'Content-Type: application/json' \
  --data "$(printf '{"email":"nobody@%s"}' "$SMOKE_DOMAIN")"
expect_status "request-otp answers 202 for an unknown email too" 202
mail_seen=0
for _ in $(seq "$MAIL_POLL_ATTEMPTS"); do
  request GET "$MAILPIT_URL/api/v1/search?query=to:$SMOKE_OWNER_EMAIL"
  if [[ "$STATUS" == "200" ]] && grep -q "$RESET_MAIL_SUBJECT" "$BODY"; then mail_seen=1; break; fi
  sleep "$POLL_INTERVAL_SECONDS"
done
if [[ "$mail_seen" == "1" ]]; then pass "the reset code reaches Mailpit over SMTP"; else fail "no reset mail in Mailpit"; fi

if [[ "${SMOKE_E2E:-}" == "1" ]]; then
  echo "Playwright e2e (@abyss/e2e)"
  if E2E_ADMIN_URL="$ADMIN_ORIGIN" E2E_API_BASE_URL="$SMOKE_API_BASE_URL" \
    E2E_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" E2E_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
    E2E_MAILPIT_URL="$MAILPIT_URL" \
    E2E_2FA_EMAIL="$SMOKE_2FA_EMAIL" E2E_2FA_PASSWORD="$SMOKE_2FA_PASSWORD" \
    pnpm --dir "$ROOT_DIR" --filter @abyss/e2e test; then
    pass "e2e suite"
  else
    fail "e2e suite"
  fi
fi

if ((FAILURES > 0)); then
  echo "Smoke test failed: $FAILURES check(s)." >&2
  exit 1
fi
echo "Smoke test passed."

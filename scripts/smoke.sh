#!/usr/bin/env bash
# Proxy smoke test (T04): builds and starts docker-compose.smoke.yml, checks
# routing, trailing slashes and CORS through Traefik, checks the cms-api-init
# container (deploy:migrate, T37a), runs owner:bootstrap (T08) and re-runs the
# migrations inside the cms-api image,
# checks login/refresh (T09) and OTP mail delivery to Mailpit (T12), then
# tears it down.
#
# Optional env:
#   SMOKE_DOMAIN           base domain (default domain.localhost)
#   SMOKE_HTTP_PORT        host port Traefik listens on (default 8080)
#   SMOKE_TIMEOUT_SECONDS  how long to wait for the stack (default 180)
#   SMOKE_KEEP=1           leave the stack running afterwards (for browser checks)
#                          and write the e2e env to .smoke/e2e-vars.sh, so
#                          `pnpm e2e:spec <spec>` can run single specs against it
#   SMOKE_E2E=1            also run the Playwright suite (@abyss/e2e) against the
#                          stack as the bootstrapped owner (T11)
#   SMOKE_NO_BUILD=1       reuse the images from the last build (only when no
#                          product code changed since, e.g. e2e-only edits)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Shared with scripts/e2e-stack.sh: log fragments, account seeding, E2E_* export.
# shellcheck source=lib/stack-seed.sh
source "$ROOT_DIR/scripts/lib/stack-seed.sh"
COMPOSE_FILE="$ROOT_DIR/docker-compose.smoke.yml"
DEFAULT_DOMAIN="domain.localhost"
DEFAULT_HTTP_PORT="8080"
DEFAULT_TIMEOUT_SECONDS="180"
HTTP_DEFAULT_PORT="80"
POLL_INTERVAL_SECONDS="2"
LOOPBACK="127.0.0.1"
API_PREFIX="/api/v1"
# Web (Next.js) routing checks: a path that never exists, and the same path
# with a trailing slash (Next.js redirects before routing: 308 to the slashless form).
WEB_UNKNOWN_PATH="/this-page-does-not-exist"
WEB_SLASH_PATH="$WEB_UNKNOWN_PATH/"
HEALTH_OK_BODY='"status":"ok"'
# Security header values (SPEC D17); keep in step with the app configs.
HSTS_VALUE="max-age=63072000; includeSubDomains"
REFERRER_POLICY_VALUE="strict-origin-when-cross-origin"
API_CSP_VALUE="default-src 'none'; frame-ancestors 'none'"
TURNSTILE_ORIGIN="https://challenges.cloudflare.com"
CLOUDINARY_ORIGIN="https://res.cloudinary.com"
INIT_SERVICE="cms-api-init"
INIT_EXIT_CODE_FORMAT='{{.State.ExitCode}}'
DB_MIGRATE_CMD=(npm run --silent db:migrate)
DB_MIGRATE_NOTHING="No pending migrations to apply."
DB_SEED_NOTHING="System roles already seeded."
OWNER_EXISTS="An owner account already exists."
RESET_2FA_CMD=(npm run --silent owner:reset-2fa --)
RESET_2FA_UNKNOWN="No account with this email."
RESET_2FA_NOT_ON="Two-factor authentication is not on for this account."
RESET_2FA_NO_TTY="No terminal for the confirmation prompt."
CONTENT_MIGRATE_CMD=(node dist/modules/content-engine/cli/migrate.js)
CONTENT_MIGRATE_NOTHING="No pending content migrations."
REFRESH_COOKIE_NAME="__Secure-abyss_rt"
JWT_ACCESS_KID="smoke"
TOTP_ENC_KID="smoke-totp"
RESET_MAIL_SUBJECT="Your Abyss CMS password reset code"
MAIL_POLL_ATTEMPTS="15"
# Written only with SMOKE_KEEP=1 (gitignored, mode 600): the e2e env of the kept
# stack, read by scripts/e2e-spec.sh. Removed when the stack is torn down here.
E2E_VARS_FILE="$ROOT_DIR/.smoke/e2e-vars.sh"

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
export SMOKE_DB_PASSWORD="$(stack_random_secret)"
export SMOKE_JWT_ACCESS_SECRET="$(stack_random_secret)"
export SMOKE_OTP_PEPPER="$(stack_random_secret)"
export SMOKE_TOTP_ENC_KEY="$(stack_random_secret)"
stack_generate_credentials "$SMOKE_DOMAIN"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
# api_exec [docker exec options...] -- <command...>: runs in the cms-api service.
api_exec() {
  local options=()
  while [[ "$1" != "--" ]]; do options+=("$1"); shift; done
  shift
  compose exec -T ${options[@]+"${options[@]}"} cms-api "$@"
}

WORK_DIR="$(mktemp -d)"
cleanup() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    echo "--- cms-api logs ---" >&2
    compose logs --no-color --tail 50 cms-api-init cms-api >&2 || true
  fi
  if [[ "${SMOKE_KEEP:-}" == "1" ]]; then
    echo "SMOKE_KEEP=1: stack left running. Stop it with: docker compose -p abyss-smoke down -v"
  else
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    rm -f "$E2E_VARS_FILE"
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
  awk -v name="$(echo "$1" | tr '[:upper:]' '[:lower:]')" '
    {
      sep = index($0, ": ")
      if (sep == 0) next
      if (tolower(substr($0, 1, sep - 1)) == name) {
        value = substr($0, sep + 2); sub(/\r$/, "", value); print value; exit
      }
    }
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

BUILD_FLAG=(--build)
if [[ "${SMOKE_NO_BUILD:-}" == "1" ]]; then
  BUILD_FLAG=()
  echo "SMOKE_NO_BUILD=1: reusing the last built images."
fi
# A fresh stack gets new secrets: any vars file from an earlier stack is stale.
rm -f "$E2E_VARS_FILE"
echo "Building and starting the smoke stack ($WEB_ORIGIN, $ADMIN_ORIGIN)..."
compose up ${BUILD_FLAG[@]+"${BUILD_FLAG[@]}"} --detach --wait --wait-timeout "$TIMEOUT_SECONDS"

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

echo "Security headers (SPEC D17)"
# header_count <name>: how many times the last response sent a header.
header_count() {
  awk -v name="$(echo "$1" | tr '[:upper:]' '[:lower:]')" -F':' '
    tolower($1) == name { n++ } END { print n + 0 }
  ' "$HEADERS"
}
expect_common_security_headers() {
  local label="$1"
  expect_header "$label sends HSTS" Strict-Transport-Security "$HSTS_VALUE"
  expect_header "$label sends nosniff" X-Content-Type-Options nosniff
  expect_header "$label sends Referrer-Policy" Referrer-Policy "$REFERRER_POLICY_VALUE"
  expect_header "$label sends no X-Powered-By" X-Powered-By ""
}
nonce_of() { header Content-Security-Policy | sed -n "s/.*'nonce-\([^']*\)'.*/\1/p" | head -n 1; }

request GET "$WEB_ORIGIN/"
expect_common_security_headers "web /"
web_csp="$(header Content-Security-Policy)"
web_nonce_1="$(nonce_of)"
if [[ -n "$web_nonce_1" ]]; then pass "web CSP carries a script nonce"; else fail "web CSP has no nonce: '$web_csp'"; fi
if [[ "$web_csp" == *"script-src 'self' 'nonce-"*"'strict-dynamic'"*"$TURNSTILE_ORIGIN"* ]]; then pass "web CSP script-src: nonce + strict-dynamic + Turnstile"; else fail "web CSP script-src: '$web_csp'"; fi
if [[ "$web_csp" == *"frame-ancestors 'none'"* && "$web_csp" == *"style-src-attr 'unsafe-inline'"* && "$web_csp" == *"$CLOUDINARY_ORIGIN"* ]]; then pass "web CSP has frame-ancestors, style-src-attr and Cloudinary img-src"; else fail "web CSP directives: '$web_csp'"; fi
# The nonce on the page must match the header, and change on every response.
if grep -q "nonce=\"$web_nonce_1\"" "$BODY"; then pass "web page scripts carry the header nonce"; else fail "web page has no script with the header nonce"; fi
request GET "$WEB_ORIGIN/"
web_nonce_2="$(nonce_of)"
if [[ -n "$web_nonce_2" && "$web_nonce_2" != "$web_nonce_1" ]]; then pass "web nonce is fresh per response"; else fail "web nonce repeated: '$web_nonce_1' '$web_nonce_2'"; fi
request GET "$WEB_ORIGIN$WEB_UNKNOWN_PATH"
expect_common_security_headers "web 404"

request GET "$ADMIN_ORIGIN/"
expect_common_security_headers "admin /"
admin_csp="$(header Content-Security-Policy)"
if [[ "$admin_csp" == *"script-src 'self';"* && "$admin_csp" == *"connect-src 'self' $WEB_ORIGIN;"* && "$admin_csp" == *"$CLOUDINARY_ORIGIN"* ]]; then pass "admin CSP: script-src self, connect-src is the API origin (no path), Cloudinary img-src"; else fail "admin CSP: '$admin_csp'"; fi
# style-src carries a per-request nonce (Radix scroll-lock style); the HTML
# shell exposes the same value in a meta tag, and it changes per response.
admin_style_nonce="$(nonce_of)"
if [[ -n "$admin_style_nonce" && "$admin_csp" == *"style-src 'self' 'nonce-$admin_style_nonce';"* ]]; then pass "admin style-src has a nonce (no unsafe-inline)"; else fail "admin style-src: '$admin_csp'"; fi
if grep -q "<meta name=\"csp-nonce\" content=\"$admin_style_nonce\">" "$BODY"; then pass "admin HTML meta csp-nonce matches the header"; else fail "admin HTML has no matching csp-nonce meta"; fi
request GET "$ADMIN_ORIGIN/"
if [[ -n "$(nonce_of)" && "$(nonce_of)" != "$admin_style_nonce" ]]; then pass "admin nonce is fresh per response"; else fail "admin nonce repeated"; fi
request GET "$ADMIN_ORIGIN/accounts/settings"
expect_common_security_headers "admin client route"
if grep -q "<meta name=\"csp-nonce\" content=\"$(nonce_of)\">" "$BODY"; then pass "admin client route HTML carries the matching nonce meta"; else fail "admin client route has no matching nonce meta"; fi

request GET "$WEB_ORIGIN$API_PREFIX/health/live"
expect_header "API sends default-src 'none'" Content-Security-Policy "$API_CSP_VALUE"
if [[ "$(header_count Content-Security-Policy)" == "1" ]]; then pass "API has exactly one CSP header (Traefik adds none)"; else fail "API CSP header count: $(header_count Content-Security-Policy)"; fi
expect_header "API sends no X-Powered-By" X-Powered-By ""
request POST "$WEB_ORIGIN$API_PREFIX/graphql" -H 'Content-Type: application/json' --data '{"query":"{__typename}"}'
expect_header "POST /graphql sends default-src 'none'" Content-Security-Policy "$API_CSP_VALUE"
expect_header "POST /graphql sends no X-Powered-By" X-Powered-By ""

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
  output="$(printf '%s\n' "$input" | api_exec -e OWNER_EMAIL="$STACK_OWNER_EMAIL" -- "$@" 2>&1)" || ok=0
  if [[ "$ok" != "$want_ok" ]]; then fail "$label: exit status mismatch: $output"; return; fi
  for fragment in "${fragments[@]}"; do
    if [[ "$output" != *"$fragment"* ]]; then fail "$label: missing '$fragment' in: $output"; return; fi
  done
  if [[ "$output" == *"$STACK_OWNER_PASSWORD"* ]]; then fail "$label: output contains the password"; return; fi
  pass "$label"
}

echo "Init container ($INIT_SERVICE: deploy:migrate, T37a)"
init_container="$(compose ps --all --quiet "$INIT_SERVICE")"
init_exit="$(docker inspect --format "$INIT_EXIT_CODE_FORMAT" "$init_container" 2>/dev/null || echo "missing")"
if [[ "$init_exit" == "0" ]]; then pass "$INIT_SERVICE exited 0"; else fail "$INIT_SERVICE exit code: $init_exit"; fi
init_log="$(compose logs --no-color "$INIT_SERVICE" 2>&1 || true)"
for fragment in "$DB_MIGRATE_APPLIED" "$DB_MIGRATE_SEEDED" "$CONTENT_MIGRATE_APPLIED"; do
  if [[ "$init_log" == *"$fragment"* ]]; then pass "$INIT_SERVICE log has '$fragment'"; else fail "$INIT_SERVICE log lacks '$fragment': $init_log"; fi
done

echo "Migrations again + owner:bootstrap inside the cms-api image"
in_api "db:migrate again has nothing pending" "" 1 \
  "$DB_MIGRATE_NOTHING" "$DB_SEED_NOTHING" -- "${DB_MIGRATE_CMD[@]}"
in_api "owner:bootstrap creates the owner" "$STACK_OWNER_PASSWORD" 1 \
  "$OWNER_CREATED$STACK_OWNER_EMAIL" -- "${OWNER_BOOTSTRAP_CMD[@]}"
in_api "owner:bootstrap refuses a second owner" "$STACK_OWNER_PASSWORD" 0 \
  "$OWNER_EXISTS" -- "${OWNER_BOOTSTRAP_CMD[@]}"
stack_seed_extra_accounts
# Break-glass 2FA reset (T13a): refusals only, so no account state changes
# (the owner login and refresh checks below still pass).
in_api "owner:reset-2fa refuses an unknown email" "" 0 \
  "$RESET_2FA_UNKNOWN" -- "${RESET_2FA_CMD[@]}" --email "nobody@$SMOKE_DOMAIN" --yes
in_api "owner:reset-2fa refuses an account with 2FA off" "" 0 \
  "$RESET_2FA_NOT_ON" -- "${RESET_2FA_CMD[@]}" --email "$STACK_OWNER_EMAIL" --yes
in_api "owner:reset-2fa needs --yes without a terminal" "" 0 \
  "$RESET_2FA_NO_TTY" -- "${RESET_2FA_CMD[@]}" --email "$STACK_OWNER_EMAIL"

in_api "content:migrate again has nothing pending" "" 1 \
  "$CONTENT_MIGRATE_NOTHING" -- "${CONTENT_MIGRATE_CMD[@]}"

echo "Auth through the proxy (T09)"
login_body() { printf '{"email":"%s","password":"%s"}' "$STACK_OWNER_EMAIL" "$1"; }
request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
  --data "$(login_body "$STACK_OWNER_PASSWORD")"
expect_status "POST auth/login/ with trailing slash, right password (SPEC §12-17)" 200
refresh_cookie="$(header Set-Cookie | sed -n "s/^\($REFRESH_COOKIE_NAME=[^;]*\);.*/\1/p")"
if [[ -n "$refresh_cookie" ]]; then pass "login sets the refresh cookie"; else fail "login sets no refresh cookie"; fi
request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
  --data "$(login_body "wrong-$STACK_OWNER_PASSWORD")"
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
  --data "$(printf '{"email":"%s"}' "$STACK_OWNER_EMAIL")"
expect_status "request-otp answers 202" 202
request POST "$WEB_ORIGIN$API_PREFIX/auth/password/request-otp" -H 'Content-Type: application/json' \
  --data "$(printf '{"email":"nobody@%s"}' "$SMOKE_DOMAIN")"
expect_status "request-otp answers 202 for an unknown email too" 202
mail_seen=0
for _ in $(seq "$MAIL_POLL_ATTEMPTS"); do
  request GET "$MAILPIT_URL/api/v1/search?query=to:$STACK_OWNER_EMAIL"
  if [[ "$STATUS" == "200" ]] && grep -q "$RESET_MAIL_SUBJECT" "$BODY"; then mail_seen=1; break; fi
  sleep "$POLL_INTERVAL_SECONDS"
done
if [[ "$mail_seen" == "1" ]]; then pass "the reset code reaches Mailpit over SMTP"; else fail "no reset mail in Mailpit"; fi

stack_export_e2e_env "$ADMIN_ORIGIN" "$SMOKE_API_BASE_URL" "$MAILPIT_URL"

if [[ "${SMOKE_KEEP:-}" == "1" ]]; then
  mkdir -p "$(dirname "$E2E_VARS_FILE")"
  (
    umask 077
    for name in "${E2E_VARS[@]}"; do printf 'export %s=%q\n' "$name" "${!name}"; done >"$E2E_VARS_FILE"
  )
  pass "e2e env written for pnpm e2e:spec (.smoke/e2e-vars.sh)"
fi

if [[ "${SMOKE_E2E:-}" == "1" ]]; then
  echo "Playwright e2e (@abyss/e2e)"
  if pnpm --dir "$ROOT_DIR" --filter @abyss/e2e test; then
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

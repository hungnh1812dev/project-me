#!/usr/bin/env bash
# Proxy smoke test: builds and starts docker-compose.smoke.yml, checks
# routing, trailing slashes and CORS through Traefik, checks the cms-api-init
# container (deploy:migrate), creates the owner through the setup route, checks
# that owner:bootstrap refuses and re-runs the migrations inside the cms-api
# image, checks login/refresh and OTP mail delivery to Mailpit, then tears it
# down. The check groups live in scripts/smoke/<group>.sh.
#
# Optional env:
#   SMOKE_DOMAIN           base domain (default domain.localhost)
#   SMOKE_HTTP_PORT        host port Traefik listens on (default 8080)
#   SMOKE_TIMEOUT_SECONDS  how long to wait for the stack (default 180)
#   SMOKE_KEEP=1           leave the stack running afterwards (for browser checks)
#                          and write the e2e env to .smoke/e2e-vars.sh, so
#                          `pnpm e2e:spec <spec>` can run single specs against it
#   SMOKE_E2E=1            also run the Playwright suite (@abyss/e2e) against the
#                          stack as the bootstrapped owner
#   SMOKE_NO_BUILD=1       reuse the images from the last build (only when no
#                          product code changed since, e.g. e2e-only edits)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Log fragments, account seeding, E2E_* export.
# shellcheck source=lib/stack-seed.sh
source "$ROOT_DIR/scripts/lib/stack-seed.sh"
# Every cms-api value this script asserts (messages, header values, cookie name).
# shellcheck source=lib/expected-output.sh
source "$ROOT_DIR/scripts/lib/expected-output.sh"
# Check sections: each defines check_<section>() functions, run in order below.
for section_file in routing security-headers cors init-container owner-setup auth mail; do
  # shellcheck source=/dev/null
  source "$ROOT_DIR/scripts/smoke/$section_file.sh"
done
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
JWT_ACCESS_KID="smoke"
TOTP_ENC_KID="smoke-totp"
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
web_home_ready() {
  request GET "$WEB_ORIGIN/"
  [[ "$STATUS" == "200" ]]
}
wait_until_ready() {
  local probe="$1" url="$2"
  until "$probe"; do
    if ((SECONDS >= deadline)); then
      echo "Timed out waiting for $url (last status $STATUS)" >&2
      exit 1
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
}
wait_until_ready api_ready "$WEB_ORIGIN$API_PREFIX/health/ready"
# The web route can lag the API: Traefik may not route it yet, and the first
# render of / is GraphQL-backed. Assert routing only once / answers 200.
echo "Waiting for the web home page behind the proxy..."
wait_until_ready web_home_ready "$WEB_ORIGIN/"

check_routing
check_security_headers
check_health
check_trailing_slashes
check_cors

check_init_container
check_owner_setup
check_migrations_again
check_auth
check_two_factor
check_mail

stack_resolve_db_identity
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

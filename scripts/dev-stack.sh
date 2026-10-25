#!/usr/bin/env bash
# Dev stack for tier 2 e2e (skill test-tiers): Postgres and Mailpit from ready
# images (docker-compose.dev.yml, project abyss-dev), and cms-api, cms-admin and
# web in dev mode on the host. No image build. Never touches abyss-smoke.
#   pnpm dev:stack        start (any earlier dev stack is replaced), write the e2e vars
#   pnpm dev:stack:stop   stop the apps and remove the containers and volumes
#   pnpm e2e:spec tests/admin-auth.spec.ts      (E2E_STACK=dev if a smoke stack is kept too)
# Env comes only from .localEnv.agent (created with generated dev-only values when
# missing; key names in apps/e2e/.env.example). Logs and pids: .dev-stack/.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/stack-seed.sh
source "$ROOT_DIR/scripts/lib/stack-seed.sh"
# shellcheck source=lib/expected-output.sh
source "$ROOT_DIR/scripts/lib/expected-output.sh"

COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
LOCAL_ENV_FILE="$ROOT_DIR/.localEnv.agent"
STATE_DIR="$ROOT_DIR/.dev-stack"
E2E_VARS_FILE="$STATE_DIR/e2e-vars.sh"
PID_DIR="$STATE_DIR/pids"
API_DIR="$ROOT_DIR/apps/cms-api"
DOMAIN="domain.localhost"
API_PREFIX="/api/v1"
LOOPBACK="127.0.0.1"
HEALTH_OK_BODY='"status":"ok"'
TURNSTILE_TEST_SITE_KEY="1x00000000000000000000AA"
RATE_LIMIT_OVERRIDE_OPT_IN="smoke"
RATE_LIMIT_OVERRIDE="10000"
READY_TIMEOUT_SECONDS=180
POLL_INTERVAL_SECONDS=2
LOG_TAIL_LINES=40
APPS=(cms-api cms-admin web)

# Default host ports, off the usual dev ports; override them in .localEnv.agent.
DEFAULT_DB_PORT=55432
DEFAULT_API_PORT=3100
DEFAULT_ADMIN_PORT=5173
DEFAULT_WEB_PORT=5174
DEFAULT_MAILPIT_HTTP_PORT=8125
DEFAULT_MAILPIT_SMTP_PORT=1125

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1" >&2; FAILURES=$((FAILURES + 1)); }
FAILURES=0

# api_exec [-e VAR=value ...] -- <command...>: runs in apps/cms-api on the host
# (the smoke stack runs it in the container); stdin passes through.
api_exec() {
  local vars=()
  while [[ "$1" != "--" ]]; do
    if [[ "$1" == "-e" ]]; then vars+=("$2"); shift; fi
    shift
  done
  shift
  (cd "$API_DIR" && env ${vars[@]+"${vars[@]}"} "$@")
}

ensure_local_env_is_ignored() {
  git -C "$ROOT_DIR" check-ignore -q .localEnv.agent || { echo ".localEnv.agent is not git-ignored." >&2; exit 1; }
  grep -qxF .localEnv.agent "$ROOT_DIR/.dockerignore" || { echo ".localEnv.agent is not in .dockerignore." >&2; exit 1; }
}

create_local_env() {
  ensure_local_env_is_ignored
  (
    umask 077
    {
      echo "# Agent-local dev stack values (scripts/dev-stack.sh). Dev-only, never committed."
      echo "DB_PORT=$DEFAULT_DB_PORT"
      echo "PORT=$DEFAULT_API_PORT"
      echo "DEV_STACK_ADMIN_PORT=$DEFAULT_ADMIN_PORT"
      echo "DEV_STACK_WEB_PORT=$DEFAULT_WEB_PORT"
      echo "DEV_STACK_MAILPIT_HTTP_PORT=$DEFAULT_MAILPIT_HTTP_PORT"
      echo "DEV_STACK_MAILPIT_SMTP_PORT=$DEFAULT_MAILPIT_SMTP_PORT"
      for name in DB_PASSWORD JWT_ACCESS_SECRET OTP_PEPPER TOTP_ENC_KEY; do
        echo "$name=$(stack_random_secret)"
      done
    } >"$LOCAL_ENV_FILE"
  )
  echo "Created .localEnv.agent with generated dev-only values."
}

load_local_env() {
  [[ -f "$LOCAL_ENV_FILE" ]] || create_local_env
  ensure_local_env_is_ignored
  set -a
  # shellcheck source=/dev/null
  source "$LOCAL_ENV_FILE"
  set +a
  ADMIN_PORT="${DEV_STACK_ADMIN_PORT:-$DEFAULT_ADMIN_PORT}"
  WEB_PORT_DEV="${DEV_STACK_WEB_PORT:-$DEFAULT_WEB_PORT}"
  API_PORT="${PORT:-$DEFAULT_API_PORT}"
  export DB_PORT="${DB_PORT:-$DEFAULT_DB_PORT}"
  export DEV_STACK_MAILPIT_HTTP_PORT="${DEV_STACK_MAILPIT_HTTP_PORT:-$DEFAULT_MAILPIT_HTTP_PORT}"
  export DEV_STACK_MAILPIT_SMTP_PORT="${DEV_STACK_MAILPIT_SMTP_PORT:-$DEFAULT_MAILPIT_SMTP_PORT}"
  ADMIN_ORIGIN="http://admin.$DOMAIN:$ADMIN_PORT"
  WEB_ORIGIN="http://$DOMAIN:$WEB_PORT_DEV"
  API_BASE_URL="$WEB_ORIGIN$API_PREFIX"
  MAILPIT_URL="http://mail.$DOMAIN:$DEV_STACK_MAILPIT_HTTP_PORT"
}

# The cms-api settings of the host processes (the smoke stack passes the same
# kinds of values through scripts/stack/cms-api.env and compose).
export_api_env() {
  export NODE_ENV=development PORT="$API_PORT" DB_HOST="$LOOPBACK" DB_NAME=abyss DB_USERNAME=abyss
  export TRUST_PROXY_HOPS=1 ADMIN_ORIGIN WEB_ORIGIN
  export MAIL_PROVIDER=smtp SMTP_HOST="$LOOPBACK" SMTP_PORT="$DEV_STACK_MAILPIT_SMTP_PORT" SMTP_SECURE=false
  export MAIL_FROM="Abyss Dev <no-reply@$DOMAIN>" MEDIA_PROVIDER=fake
  export ALLOW_LOGIN_RATE_LIMIT_OVERRIDE="$RATE_LIMIT_OVERRIDE_OPT_IN"
  export LOGIN_RATE_LIMIT_IP="$RATE_LIMIT_OVERRIDE" LOGIN_RATE_LIMIT_EMAIL="$RATE_LIMIT_OVERRIDE"
  export REFRESH_RATE_LIMIT_IP="$RATE_LIMIT_OVERRIDE"
  # Cloudflare's public always-pass test secret (same value as the smoke stack).
  TURNSTILE_SECRET_KEY="$(sed -n 's/^TURNSTILE_SECRET_KEY=//p' "$ROOT_DIR/scripts/stack/cms-api.env")"
  export TURNSTILE_SECRET_KEY
  # Unset: dev defaults for the key ids; the setup route stays closed.
  unset JWT_ACCESS_KID TOTP_ENC_KID OWNER_SETUP_TOKEN
}

kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

stop_apps() {
  local app pid_file
  for app in "${APPS[@]}"; do
    pid_file="$PID_DIR/$app.pid"
    [[ -f "$pid_file" ]] || continue
    kill_tree "$(cat "$pid_file")"
    rm -f "$pid_file"
  done
}

stop_stack() {
  stop_apps
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$E2E_VARS_FILE"
}

start_app() {
  local app="$1"
  shift
  mkdir -p "$PID_DIR"
  nohup "$@" >"$STATE_DIR/$app.log" 2>&1 &
  echo $! >"$PID_DIR/$app.pid"
}

wait_until() {
  local label="$1" app="$2"
  shift 2
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  until "$@"; do
    if ((SECONDS >= deadline)); then
      echo "Timed out waiting for $label." >&2
      tail -n "$LOG_TAIL_LINES" "$STATE_DIR/$app.log" >&2 || true
      exit 1
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
}

api_is_ready() { curl -sS --max-time 5 "http://$LOOPBACK:$API_PORT$API_PREFIX/health/ready" 2>/dev/null | grep -q "$HEALTH_OK_BODY"; }
admin_is_up() { curl -sS --max-time 5 -o /dev/null "http://localhost:$ADMIN_PORT/" 2>/dev/null; }
web_is_up() { curl -sS --max-time 30 -o /dev/null "http://localhost:$WEB_PORT_DEV/" 2>/dev/null; }

build_prerequisites() {
  [[ -d "$ROOT_DIR/packages/form-commons/dist" ]] || pnpm --dir "$ROOT_DIR" --filter '@abyss/form-commons...' build
  [[ -d "$API_DIR/src/generated/prisma" ]] || pnpm --dir "$ROOT_DIR" --filter @abyss/cms-api db:generate
  # The migration CLIs run from dist/, as in the image.
  pnpm --dir "$ROOT_DIR" --filter @abyss/cms-api build
}

prepare_data() {
  echo "Migrating and seeding..."
  api_exec -- npm run --silent db:migrate >>"$STATE_DIR/migrate.log" 2>&1
  api_exec -- node dist/modules/content-engine/cli/migrate.js >>"$STATE_DIR/migrate.log" 2>&1
  printf '%s\n' "$STACK_OWNER_PASSWORD" | api_exec -e OWNER_EMAIL="$STACK_OWNER_EMAIL" -- "${OWNER_BOOTSTRAP_CMD[@]}" >>"$STATE_DIR/migrate.log" 2>&1
  stack_seed_extra_accounts
  ((FAILURES == 0)) || { echo "Seeding failed." >&2; exit 1; }
}

start_apps() {
  echo "Starting cms-api, cms-admin and web in dev mode..."
  start_app cms-api pnpm --dir "$ROOT_DIR" --filter @abyss/cms-api start:dev
  VITE_API_BASE_URL="$API_BASE_URL" DEV_SERVER_PORT="$ADMIN_PORT" \
    start_app cms-admin pnpm --dir "$ROOT_DIR" --filter @abyss/cms-admin dev
  DEV_SERVER_PORT="$WEB_PORT_DEV" DEV_API_PROXY_TARGET="http://$LOOPBACK:$API_PORT" \
    API_INTERNAL_URL="http://$LOOPBACK:$API_PORT$API_PREFIX" WEB_REVALIDATE_SECONDS=0 \
    NEXT_PUBLIC_API_BASE_URL="$API_PREFIX" NEXT_PUBLIC_TURNSTILE_SITE_KEY="$TURNSTILE_TEST_SITE_KEY" \
    start_app web pnpm --dir "$ROOT_DIR" --filter @abyss/web dev
  wait_until "cms-api ($API_PREFIX/health/ready)" cms-api api_is_ready
  wait_until "cms-admin ($ADMIN_ORIGIN)" cms-admin admin_is_up
  wait_until "web ($WEB_ORIGIN)" web web_is_up
}

write_e2e_vars() {
  stack_resolve_db_identity
  stack_export_e2e_env "$ADMIN_ORIGIN" "$API_BASE_URL" "$MAILPIT_URL"
  (
    umask 077
    for name in "${E2E_VARS[@]}"; do printf 'export %s=%q\n' "$name" "${!name}"; done >"$E2E_VARS_FILE"
  )
}

start_stack() {
  local started_at=$SECONDS
  load_local_env
  stop_stack
  mkdir -p "$STATE_DIR"
  trap 'code=$?; if ((code != 0)); then stop_stack; fi; exit $code' EXIT
  export_api_env
  stack_generate_credentials "$DOMAIN"
  echo "Starting Postgres and Mailpit (project abyss-dev)..."
  compose up --detach --wait --wait-timeout "$READY_TIMEOUT_SECONDS"
  export DB_PASSWORD
  build_prerequisites
  prepare_data
  start_apps
  write_e2e_vars
  echo "Dev stack ready in $((SECONDS - started_at)) s: admin $ADMIN_ORIGIN, web $WEB_ORIGIN, mail $MAILPIT_URL."
  echo "Run specs with: pnpm e2e:spec tests/<spec>   Stop with: pnpm dev:stack:stop"
}

case "${1:-start}" in
  start) start_stack ;;
  stop) load_local_env; stop_stack; echo "Dev stack stopped." ;;
  *) echo "Usage: dev-stack.sh [start|stop]" >&2; exit 2 ;;
esac

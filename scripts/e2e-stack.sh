#!/usr/bin/env bash
# e2e on a plain `docker run` stack (T37f): the built per-service images run on
# one user-defined network, as in production:
# Traefik in front (web + /api on the domain, admin on admin.<domain>), the
# cms-api init container (deploy:migrate) before cms-api, then Playwright.
# Local smoke (scripts/smoke.sh) stays the proxy check on its own stack; both share
# scripts/lib/stack-seed.sh and scripts/stack/cms-api.env.
#
# Optional env:
#   E2E_DOMAIN             base domain (default domain.localhost)
#   E2E_HTTP_PORT          host port Traefik listens on (default 8080)
#   E2E_TIMEOUT_SECONDS    how long to wait for the stack (default 180)
#   E2E_NO_BUILD=1         do not build; use the images named by
#                          E2E_IMAGE_CMS_API, E2E_IMAGE_WEB, E2E_IMAGE_CMS_ADMIN
#                          (the web image must be built with scripts/stack/web-build.env
#                          and the admin image with VITE_API_BASE_URL=<web origin>/api/v1)
#   E2E_KEEP=1             leave the stack running (prints the teardown command)
# Exit code: Playwright's, or non-zero when the stack fails to come up.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/stack-seed.sh
source "$ROOT_DIR/scripts/lib/stack-seed.sh"

DEFAULT_DOMAIN="domain.localhost"
DEFAULT_HTTP_PORT="8080"
DEFAULT_TIMEOUT_SECONDS="180"
HTTP_DEFAULT_PORT="80"
POLL_INTERVAL_SECONDS="2"
LOOPBACK="127.0.0.1"
API_PREFIX="/api/v1"
HEALTH_OK_BODY='"status":"ok"'
NETWORK="abyss-e2e"
PREFIX="abyss-e2e-"
STACK_LABEL="abyss.stack=e2e"
STACK_LABEL_FILTER="label=$STACK_LABEL"
# Fixed name: apps/e2e (SMOKE_DB_CONTAINER in src/constants.ts) runs `docker exec <this name> psql`
# for its SQL fixtures. Follow-up for qc: read the name from the environment, then use ${PREFIX}db.
CONTAINER_DB="abyss-smoke-db-1"
CONTAINER_MAIL="${PREFIX}mailpit"
CONTAINER_PROXY="${PREFIX}proxy"
CONTAINER_API="${PREFIX}cms-api"
CONTAINER_INIT="${PREFIX}cms-api-init"
CONTAINER_WEB="${PREFIX}web"
CONTAINER_ADMIN="${PREFIX}cms-admin"
IMAGE_POSTGRES="postgres:16-alpine"
IMAGE_MAILPIT="axllent/mailpit:v1.31.6"
IMAGE_TRAEFIK="traefik:v3.6"
BUILT_IMAGE_CMS_API="${PREFIX}cms-api:local"
BUILT_IMAGE_WEB="${PREFIX}web:local"
BUILT_IMAGE_CMS_ADMIN="${PREFIX}cms-admin:local"
DB_NAME="abyss"
DB_USER="abyss"
API_PORT="3000"
WEB_PORT="8080"
ADMIN_PORT="8080"
MAILPIT_PORT="8025"
JWT_ACCESS_KID="e2e"
TOTP_ENC_KID="e2e-totp"
DOCKER_SOCKET="/var/run/docker.sock"
HEALTH_INTERVAL="2s"
HEALTH_TIMEOUT="3s"
HEALTH_RETRIES="30"
STACK_ENV_FILE_STATIC="$ROOT_DIR/scripts/stack/cms-api.env"
WEB_BUILD_ENV_FILE="$ROOT_DIR/scripts/stack/web-build.env"
LOG_DIR="$ROOT_DIR/apps/e2e/test-results/stack-logs"
HEALTH_STATUS_FORMAT='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'
TEARDOWN_COMMAND="docker ps -aq --filter $STACK_LABEL_FILTER | xargs docker rm -fv; docker network rm $NETWORK"

DOMAIN="${E2E_DOMAIN:-$DEFAULT_DOMAIN}"
HTTP_PORT="${E2E_HTTP_PORT:-$DEFAULT_HTTP_PORT}"
TIMEOUT_SECONDS="${E2E_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"
ADMIN_HOST="admin.$DOMAIN"
MAIL_HOST="mail.$DOMAIN"
PORT_SUFFIX=""
if [[ "$HTTP_PORT" != "$HTTP_DEFAULT_PORT" ]]; then PORT_SUFFIX=":$HTTP_PORT"; fi
WEB_ORIGIN="http://$DOMAIN$PORT_SUFFIX"
ADMIN_ORIGIN="http://$ADMIN_HOST$PORT_SUFFIX"
MAILPIT_URL="http://$MAIL_HOST$PORT_SUFFIX"
API_BASE_URL="$WEB_ORIGIN$API_PREFIX"

FAILURES=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1" >&2; FAILURES=$((FAILURES + 1)); }

WORK_DIR="$(mktemp -d)"
STACK_STARTED=0

stack_container_ids() { docker ps -aq --filter "$STACK_LABEL_FILTER"; }

dump_logs() {
  local name
  mkdir -p "$LOG_DIR"
  for name in $(docker ps -a --filter "$STACK_LABEL_FILTER" --format '{{.Names}}'); do
    docker logs "$name" >"$LOG_DIR/$name.log" 2>&1 || true
  done
  echo "Container logs written to $LOG_DIR" >&2
}

remove_stack() {
  local ids
  ids="$(stack_container_ids)"
  # -v also removes the anonymous Postgres volume
  if [[ -n "$ids" ]]; then
    # shellcheck disable=SC2086 # one id per word
    docker rm -fv $ids >/dev/null 2>&1 || true
  fi
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}

cleanup() {
  local code=$?
  if [[ "$STACK_STARTED" == "1" ]]; then
    if [[ $code -ne 0 ]]; then dump_logs; fi
    if [[ "${E2E_KEEP:-}" == "1" ]]; then
      echo "E2E_KEEP=1: stack left running. Stop it with: $TEARDOWN_COMMAND"
    else
      remove_stack
    fi
  fi
  rm -rf "$WORK_DIR"
  exit "$code"
}
trap cleanup EXIT

die() { echo "$1" >&2; exit 1; }

# request <url>: curl with every stack host pinned to loopback (no hosts entry needed).
request() {
  curl -sS --max-time 10 \
    --resolve "$DOMAIN:$HTTP_PORT:$LOOPBACK" \
    --resolve "$ADMIN_HOST:$HTTP_PORT:$LOOPBACK" \
    --resolve "$MAIL_HOST:$HTTP_PORT:$LOOPBACK" "$@"
}

# build_images: the three production images, with the e2e build args.
build_images() {
  local line args=()
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    args+=(--build-arg "$line")
  done <"$WEB_BUILD_ENV_FILE"
  echo "Building the images..."
  docker build -f "$ROOT_DIR/apps/cms-api/Dockerfile" -t "$BUILT_IMAGE_CMS_API" "$ROOT_DIR"
  docker build -f "$ROOT_DIR/apps/web/Dockerfile" ${args[@]+"${args[@]}"} -t "$BUILT_IMAGE_WEB" "$ROOT_DIR"
  docker build -f "$ROOT_DIR/apps/cms-admin/Dockerfile" \
    --build-arg "VITE_API_BASE_URL=$API_BASE_URL" -t "$BUILT_IMAGE_CMS_ADMIN" "$ROOT_DIR"
}

if [[ "${E2E_NO_BUILD:-}" == "1" ]]; then
  IMAGE_CMS_API="${E2E_IMAGE_CMS_API:?E2E_NO_BUILD=1 needs E2E_IMAGE_CMS_API}"
  IMAGE_WEB="${E2E_IMAGE_WEB:?E2E_NO_BUILD=1 needs E2E_IMAGE_WEB}"
  IMAGE_CMS_ADMIN="${E2E_IMAGE_CMS_ADMIN:?E2E_NO_BUILD=1 needs E2E_IMAGE_CMS_ADMIN}"
  echo "E2E_NO_BUILD=1: using the prebuilt images."
else
  build_images
  IMAGE_CMS_API="$BUILT_IMAGE_CMS_API"
  IMAGE_WEB="$BUILT_IMAGE_WEB"
  IMAGE_CMS_ADMIN="$BUILT_IMAGE_CMS_ADMIN"
fi

# Throwaway values for this run only (production mode needs them). They go to the
# containers through mode-600 env files, so they never show up in `ps`.
DB_PASSWORD="$(stack_random_secret)"
stack_generate_credentials "$DOMAIN"
DB_ENV_FILE="$WORK_DIR/db.env"
API_ENV_FILE="$WORK_DIR/cms-api.env"
(
  umask 077
  printf 'POSTGRES_USER=%s\nPOSTGRES_DB=%s\nPOSTGRES_PASSWORD=%s\n' "$DB_USER" "$DB_NAME" "$DB_PASSWORD" >"$DB_ENV_FILE"
  {
    printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'ADMIN_ORIGIN=%s\n' "$ADMIN_ORIGIN"
    printf 'WEB_ORIGIN=%s\n' "$WEB_ORIGIN"
    printf 'MAIL_FROM=Abyss E2E <no-reply@%s>\n' "$DOMAIN"
    printf 'JWT_ACCESS_SECRET=%s\n' "$(stack_random_secret)"
    printf 'JWT_ACCESS_KID=%s\n' "$JWT_ACCESS_KID"
    printf 'OTP_PEPPER=%s\n' "$(stack_random_secret)"
    printf 'TOTP_ENC_KEY=%s\n' "$(stack_random_secret)"
    printf 'TOTP_ENC_KID=%s\n' "$TOTP_ENC_KID"
  } >"$API_ENV_FILE"
)

if [[ -n "$(stack_container_ids)" ]] || docker network inspect "$NETWORK" >/dev/null 2>&1; then
  die "An e2e stack already exists. Remove it first: $TEARDOWN_COMMAND"
fi

STACK_STARTED=1
echo "Starting the e2e stack ($WEB_ORIGIN, $ADMIN_ORIGIN)..."
docker network create --label "$STACK_LABEL" "$NETWORK" >/dev/null

docker run --detach --name "$CONTAINER_DB" --network "$NETWORK" --network-alias db \
  --label "$STACK_LABEL" --env-file "$DB_ENV_FILE" \
  --health-cmd "pg_isready -U $DB_USER -d $DB_NAME" --health-interval "$HEALTH_INTERVAL" \
  --health-timeout "$HEALTH_TIMEOUT" --health-retries "$HEALTH_RETRIES" \
  "$IMAGE_POSTGRES" >/dev/null

docker run --detach --name "$CONTAINER_MAIL" --network "$NETWORK" --network-alias mailpit \
  --label "$STACK_LABEL" \
  --label traefik.enable=true \
  --label "traefik.http.routers.mail.entrypoints=web" \
  --label "traefik.http.routers.mail.rule=Host(\`$MAIL_HOST\`)" \
  --label "traefik.http.services.mail.loadbalancer.server.port=$MAILPIT_PORT" \
  --health-cmd "/mailpit readyz" --health-interval "$HEALTH_INTERVAL" \
  --health-timeout "$HEALTH_TIMEOUT" --health-retries "$HEALTH_RETRIES" \
  "$IMAGE_MAILPIT" >/dev/null

# The provider is limited to containers carrying this stack's label, so another
# Traefik-routed stack on the same Docker host (e.g. local smoke) is never picked up.
docker run --detach --name "$CONTAINER_PROXY" --network "$NETWORK" --label "$STACK_LABEL" \
  --publish "$HTTP_PORT:80" --volume "$DOCKER_SOCKET:$DOCKER_SOCKET:ro" \
  --health-cmd "traefik healthcheck --ping" --health-interval "$HEALTH_INTERVAL" \
  --health-timeout "$HEALTH_TIMEOUT" --health-retries "$HEALTH_RETRIES" \
  "$IMAGE_TRAEFIK" \
  --providers.docker=true --providers.docker.exposedbydefault=false \
  --providers.docker.network="$NETWORK" \
  "--providers.docker.constraints=Label(\`abyss.stack\`,\`e2e\`)" \
  --entrypoints.web.address=:80 --ping=true >/dev/null

wait_healthy() {
  local name="$1" deadline=$((SECONDS + TIMEOUT_SECONDS)) status
  until [[ "$(docker inspect --format "$HEALTH_STATUS_FORMAT" "$name" 2>/dev/null || echo missing)" == "healthy" ]]; do
    status="$(docker inspect --format "$HEALTH_STATUS_FORMAT" "$name" 2>/dev/null || echo missing)"
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "missing" ]] || ((SECONDS >= deadline)); then
      die "$name did not become healthy (status: $status)"
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
}
wait_healthy "$CONTAINER_DB"
wait_healthy "$CONTAINER_MAIL"
wait_healthy "$CONTAINER_PROXY"

echo "Init container (deploy:migrate)"
init_status=0
init_log="$(docker run --name "$CONTAINER_INIT" --network "$NETWORK" --label "$STACK_LABEL" \
  --env-file "$STACK_ENV_FILE_STATIC" --env-file "$API_ENV_FILE" \
  "$IMAGE_CMS_API" npm run --silent deploy:migrate 2>&1)" || init_status=$?
if [[ "$init_status" != "0" ]]; then
  echo "$init_log" >&2
  die "$CONTAINER_INIT exited $init_status"
fi
pass "$CONTAINER_INIT exited 0"
for fragment in "$DB_MIGRATE_APPLIED" "$DB_MIGRATE_SEEDED" "$CONTENT_MIGRATE_APPLIED"; do
  if [[ "$init_log" == *"$fragment"* ]]; then pass "init log has '$fragment'"; else fail "init log lacks '$fragment': $init_log"; fi
done
if ((FAILURES > 0)); then die "The init container did not apply the migrations."; fi

docker run --detach --name "$CONTAINER_API" --network "$NETWORK" --network-alias cms-api \
  --label "$STACK_LABEL" \
  --label traefik.enable=true \
  --label "traefik.http.routers.api.entrypoints=web" \
  --label "traefik.http.routers.api.rule=Host(\`$DOMAIN\`) && PathPrefix(\`/api\`)" \
  --label "traefik.http.services.api.loadbalancer.server.port=$API_PORT" \
  --env-file "$STACK_ENV_FILE_STATIC" --env-file "$API_ENV_FILE" \
  --health-cmd "wget -qO- http://127.0.0.1:$API_PORT$API_PREFIX/health/ready" \
  --health-interval "$HEALTH_INTERVAL" --health-timeout "$HEALTH_TIMEOUT" --health-retries "$HEALTH_RETRIES" \
  "$IMAGE_CMS_API" >/dev/null
wait_healthy "$CONTAINER_API"

# The /api router has the longer rule, so it wins over the web catch-all (no StripPrefix).
# shellcheck disable=SC2016 # ${WEB_PORT} is expanded by the shell inside the container
docker run --detach --name "$CONTAINER_WEB" --network "$NETWORK" --network-alias web \
  --label "$STACK_LABEL" \
  --label traefik.enable=true \
  --label "traefik.http.routers.web.entrypoints=web" \
  --label "traefik.http.routers.web.rule=Host(\`$DOMAIN\`)" \
  --label "traefik.http.services.web.loadbalancer.server.port=$WEB_PORT" \
  --env "API_INTERNAL_URL=http://cms-api:$API_PORT$API_PREFIX" \
  --env WEB_REVALIDATE_SECONDS=0 --env "WEB_PORT=$WEB_PORT" \
  --health-cmd 'wget -q -O /dev/null "http://127.0.0.1:${WEB_PORT}/"' \
  --health-interval "$HEALTH_INTERVAL" --health-timeout "$HEALTH_TIMEOUT" --health-retries "$HEALTH_RETRIES" \
  "$IMAGE_WEB" >/dev/null

docker run --detach --name "$CONTAINER_ADMIN" --network "$NETWORK" --network-alias cms-admin \
  --label "$STACK_LABEL" \
  --label traefik.enable=true \
  --label "traefik.http.routers.admin.entrypoints=web" \
  --label "traefik.http.routers.admin.rule=Host(\`$ADMIN_HOST\`)" \
  --label "traefik.http.services.admin.loadbalancer.server.port=$ADMIN_PORT" \
  "$IMAGE_CMS_ADMIN" >/dev/null
wait_healthy "$CONTAINER_WEB"

echo "Waiting for the stack behind the proxy..."
deadline=$((SECONDS + TIMEOUT_SECONDS))
# Traefik only routes a container once it reports healthy; until then /api falls
# through to the web app (200 + HTML), so wait for the JSON body.
stack_ready() {
  request "$API_BASE_URL/health/ready" 2>/dev/null | grep -q "$HEALTH_OK_BODY" \
    && request -o /dev/null --fail "$WEB_ORIGIN/" \
    && request -o /dev/null --fail "$ADMIN_ORIGIN/" \
    && request -o /dev/null --fail "$MAILPIT_URL/api/v1/info"
}
until stack_ready; do
  if ((SECONDS >= deadline)); then die "Timed out waiting for the stack at $WEB_ORIGIN"; fi
  sleep "$POLL_INTERVAL_SECONDS"
done

# api_exec [docker exec options...] -- <command...>: runs in the cms-api container.
api_exec() {
  local options=()
  while [[ "$1" != "--" ]]; do options+=("$1"); shift; done
  shift
  docker exec -i ${options[@]+"${options[@]}"} "$CONTAINER_API" "$@"
}

echo "Seeding the owner and the e2e accounts"
owner_output="$(printf '%s\n' "$STACK_OWNER_PASSWORD" \
  | api_exec -e OWNER_EMAIL="$STACK_OWNER_EMAIL" -- "${OWNER_BOOTSTRAP_CMD[@]}" 2>&1)" || owner_output="FAILED: $owner_output"
if [[ "$owner_output" == *"$OWNER_CREATED$STACK_OWNER_EMAIL"* && "$owner_output" != *"$STACK_OWNER_PASSWORD"* ]]; then
  pass "owner:bootstrap creates the owner"
else
  fail "owner:bootstrap: ${owner_output//$STACK_OWNER_PASSWORD/***}"
fi
stack_seed_extra_accounts
if ((FAILURES > 0)); then die "Seeding failed: $FAILURES check(s)."; fi

stack_export_e2e_env "$ADMIN_ORIGIN" "$API_BASE_URL" "$MAILPIT_URL"
echo "Playwright e2e (@abyss/e2e)"
pnpm --dir "$ROOT_DIR" --filter @abyss/e2e test
echo "e2e passed."

#!/usr/bin/env bash
# Runs Playwright specs (@abyss/e2e) against a kept stack, without rebuilding or
# re-running the checks of the stack script. Two stacks can provide the vars:
#   dev    `pnpm dev:stack`            (.dev-stack/e2e-vars.sh, tier 2)
#   smoke  `SMOKE_KEEP=1 pnpm smoke`   (.smoke/e2e-vars.sh, tier 3)
# E2E_STACK=dev|smoke picks one; without it the one whose vars file exists is
# used, and with both present the script stops and asks for E2E_STACK.
# Arguments go to `playwright test`; spec paths are relative to apps/e2e:
#   pnpm e2e:spec tests/reviewer.spec.ts
#   E2E_STACK=dev pnpm e2e:spec tests/reviewer.spec.ts -g "starts a review"
# A kept stack keeps its data between runs, and rate limits keep counting.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS_FILE="$ROOT_DIR/.dev-stack/e2e-vars.sh"
SMOKE_VARS_FILE="$ROOT_DIR/.smoke/e2e-vars.sh"
HEALTH_PATH="/health/ready"
HEALTH_OK_BODY='"status":"ok"'

stack="${E2E_STACK:-}"
if [[ -z "$stack" ]]; then
  if [[ -f "$DEV_VARS_FILE" && -f "$SMOKE_VARS_FILE" ]]; then
    echo "Both a dev stack and a kept smoke stack exist: set E2E_STACK=dev or E2E_STACK=smoke." >&2
    exit 1
  elif [[ -f "$DEV_VARS_FILE" ]]; then stack="dev"
  else stack="smoke"; fi
fi
case "$stack" in
  dev) E2E_VARS_FILE="$DEV_VARS_FILE"; START_HINT="pnpm dev:stack" ;;
  smoke) E2E_VARS_FILE="$SMOKE_VARS_FILE"; START_HINT="SMOKE_KEEP=1 pnpm smoke" ;;
  *) echo "E2E_STACK must be dev or smoke (got '$stack')." >&2; exit 1 ;;
esac

if [[ ! -f "$E2E_VARS_FILE" ]]; then
  echo "No kept $stack stack: run '$START_HINT' first." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$E2E_VARS_FILE"

# The API host resolves to loopback in Chromium (*.localhost); curl needs it pinned.
api_host="$(echo "$E2E_API_BASE_URL" | sed -E 's#^https?://([^/:]+).*#\1#')"
api_port="$(echo "$E2E_API_BASE_URL" | sed -nE 's#^https?://[^/:]+:([0-9]+).*#\1#p')"
api_port="${api_port:-80}"
if ! curl -sS --max-time 5 --resolve "$api_host:$api_port:127.0.0.1" \
  "$E2E_API_BASE_URL$HEALTH_PATH" 2>/dev/null | grep -q "$HEALTH_OK_BODY"; then
  echo "The kept $stack stack is not answering ($E2E_API_BASE_URL$HEALTH_PATH)." >&2
  echo "Start a new one with '$START_HINT'." >&2
  exit 1
fi

exec pnpm --dir "$ROOT_DIR" --filter @abyss/e2e test "$@"

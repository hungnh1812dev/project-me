#!/usr/bin/env bash
# Runs Playwright specs (@abyss/e2e) against a stack kept by
# `SMOKE_KEEP=1 pnpm smoke`, without rebuilding or re-running the smoke checks.
# Arguments go to `playwright test`; spec paths are relative to apps/e2e:
#   pnpm e2e:spec tests/reviewer.spec.ts
#   pnpm e2e:spec tests/reviewer.spec.ts -g "starts a review"
# The kept stack keeps its data between runs, and rate limits keep counting.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_VARS_FILE="$ROOT_DIR/.smoke/e2e-vars.sh"
HEALTH_PATH="/health/ready"
HEALTH_OK_BODY='"status":"ok"'

if [[ ! -f "$E2E_VARS_FILE" ]]; then
  echo "No kept smoke stack: run 'SMOKE_KEEP=1 pnpm smoke' first." >&2
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
  echo "The kept smoke stack is not answering ($E2E_API_BASE_URL$HEALTH_PATH)." >&2
  echo "Start a new one with 'SMOKE_KEEP=1 pnpm smoke'." >&2
  exit 1
fi

exec pnpm --dir "$ROOT_DIR" --filter @abyss/e2e test "$@"

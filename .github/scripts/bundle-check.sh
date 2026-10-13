#!/usr/bin/env bash
# Smoke check that a locally loaded cms-admin image baked the expected API base.
# Usage: bundle-check.sh <image> [api_url]
#
# buildApiBaseUrl() joins the origin and the /api/v1 constant at runtime, so the
# minified bundle never holds the joined "<origin>/api/v1" literal. The check
# therefore looks for the two parts, quote-agnostic (the minifier emits backticks):
#   api_url set:   the origin (all trailing slashes stripped) and the /api/v1 constant.
#   api_url empty: the /api/v1 constant, no absolute http(s)://.../api/v1, and no
#                  call that receives an absolute http(s) origin literal.
# Needles verified against a real cms-admin build (relative bundle: `/api/v1`, X(``)).
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [ -z "${1}" ]; then
  echo "::error::usage: bundle-check.sh <image> [api_url]" >&2
  exit 2
fi

image="${1}"
api_url="${2:-}"
assets="/usr/share/nginx/html/assets"
quote="[\`'\"]"

# Runs grep inside the image (BusyBox grep) over the built assets; returns grep's status.
bundle_grep() {
  docker run --rm --entrypoint grep "${image}" -rq "$@" "${assets}"
}

fail() {
  echo "::error::${image}: ${1}"
  exit 1
}

if ! docker image inspect "${image}" >/dev/null 2>&1; then
  echo "::error::cannot inspect ${image}; build it with load: true before running this check" >&2
  exit 1
fi

if ! bundle_grep -E -- "${quote}/api/v1${quote}"; then
  fail "the /api/v1 constant is missing from ${assets}"
fi

if [ -n "${api_url}" ]; then
  origin="${api_url}"
  while [ "${origin%/}" != "${origin}" ]; do
    origin="${origin%/}"
  done
  if [ -z "${origin}" ]; then
    fail "api_url '${api_url}' has no origin"
  fi
  if ! bundle_grep -F -- "${origin}"; then
    fail "the API origin '${origin}' is not baked into ${assets}"
  fi
  echo "${image} bakes the API origin ${origin} with /api/v1"
  exit 0
fi

if bundle_grep -E -- "https?://[^\`'\" ]*/api/v1"; then
  fail "an absolute http(s)://.../api/v1 base is baked in, but api_url is empty"
fi

# A bare call (not a method call or `new X(`) whose only argument is an absolute
# http(s) literal is how a non-empty VITE_API_URL shows up in the minified bundle.
if bundle_grep -E -- "(^|[^A-Za-z0-9_\$. ])[A-Za-z_\$][A-Za-z0-9_\$]*\(${quote}https?://[^\`'\"]*${quote}\)"; then
  fail "an absolute API origin is baked in, but api_url is empty"
fi

echo "${image} uses the relative /api/v1 base"

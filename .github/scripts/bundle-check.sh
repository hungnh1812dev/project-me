#!/usr/bin/env bash
# Smoke check that a locally loaded cms-admin image baked the expected API base URL.
# Usage: bundle-check.sh <image> <api_base_url>
#
# VITE_API_BASE_URL is the full API base (for example https://admin.example.com/api/v1),
# inlined into the bundle as a string literal at build time. The check looks for that
# value in the built assets, with trailing slashes stripped (the app strips them too).
# It is always required: the Dockerfile refuses to build without it.
set -euo pipefail

if [ "$#" -ne 2 ] || [ -z "${1}" ] || [ -z "${2}" ]; then
  echo "::error::usage: bundle-check.sh <image> <api_base_url>" >&2
  exit 2
fi

image="${1}"
api_url="${2}"
assets="/usr/share/nginx/html/assets"

fail() {
  echo "::error::${image}: ${1}"
  exit 1
}

if ! docker image inspect "${image}" >/dev/null 2>&1; then
  echo "::error::cannot inspect ${image}; build it with load: true before running this check" >&2
  exit 1
fi

base="${api_url}"
while [ "${base%/}" != "${base}" ]; do
  base="${base%/}"
done
if [ -z "${base}" ]; then
  fail "api_base_url '${api_url}' is empty after stripping slashes"
fi

# BusyBox grep inside the image over the built assets; -F: the URL is a literal, not a pattern
if ! docker run --rm --entrypoint grep "${image}" -rqF -- "${base}" "${assets}"; then
  fail "the API base URL '${base}' is not baked into ${assets}"
fi

echo "${image} bakes the API base URL ${base}"

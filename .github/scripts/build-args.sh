#!/usr/bin/env bash
# Resolves the Docker build args of one app for _publish.yml.
# Usage: build-args.sh <app>        (cms-api | cms-admin | web)
# Reads ENVIRONMENT, TURBO_VERSION, VITE_API_BASE_URL, NEXT_PUBLIC_API_BASE_URL,
# NEXT_PUBLIC_ADMIN_URL, NEXT_PUBLIC_TURNSTILE_SITE_KEY from the environment.
# Appends `api_url` (cms-admin only) and a `build_args` block to $GITHUB_OUTPUT
# (stdout when it is unset). Every check runs before anything is written, so a
# failure leaves the output empty; it prints one `::error::<KEY> ...` line naming
# the key and the environment, never the value, and exits 1.
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "${1}" ]; then
  echo "::error::usage: build-args.sh <app>" >&2
  exit 2
fi

app="${1}"
environment="${ENVIRONMENT:-}"
turbo_version="${TURBO_VERSION:-}"
vite_api_base_url="${VITE_API_BASE_URL:-}"
web_api_base_url="${NEXT_PUBLIC_API_BASE_URL:-}"
web_admin_url="${NEXT_PUBLIC_ADMIN_URL:-}"
web_turnstile_site_key="${NEXT_PUBLIC_TURNSTILE_SITE_KEY:-}"

fail() {
  echo "::error::$1"
  exit 1
}

require_single_line() { # key value
  case "${2}" in
    *$'\n'* | *$'\r'*) fail "${1} for ${environment} must be a single line" ;;
  esac
}

require_value() { # key value
  require_single_line "${1}" "${2}"
  if [ -z "${2}" ]; then fail "${1} is not set for ${environment}"; fi
}

validate() {
  require_single_line TURBO_VERSION "${turbo_version}"
  case "${app}" in
    cms-api) ;;
    cms-admin)
      require_value VITE_API_BASE_URL "${vite_api_base_url}"
      ;;
    web)
      require_value NEXT_PUBLIC_API_BASE_URL "${web_api_base_url}"
      require_single_line NEXT_PUBLIC_ADMIN_URL "${web_admin_url}"
      require_single_line NEXT_PUBLIC_TURNSTILE_SITE_KEY "${web_turnstile_site_key}"
      ;;
    *) fail "unknown app '${app}' for ${environment}" ;;
  esac
}

emit() {
  if [ "${app}" = cms-admin ]; then
    echo "api_url=${vite_api_base_url}"
  fi
  echo 'build_args<<ARGS_EOF'
  echo "TURBO_VERSION=${turbo_version}"
  case "${app}" in
    cms-admin)
      echo "VITE_API_BASE_URL=${vite_api_base_url}"
      ;;
    web)
      echo "NEXT_PUBLIC_API_BASE_URL=${web_api_base_url}"
      echo "NEXT_PUBLIC_ADMIN_URL=${web_admin_url}"
      echo "NEXT_PUBLIC_TURNSTILE_SITE_KEY=${web_turnstile_site_key}"
      ;;
  esac
  echo 'ARGS_EOF'
}

validate
emit >>"${GITHUB_OUTPUT:-/dev/stdout}"

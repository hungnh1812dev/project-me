#!/usr/bin/env bash
# Tests for build-args.sh: happy path per app, and each failure leaves the output empty.
# Usage: bash .github/scripts/build-args.test.sh
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build-args.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/build-args-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT

secret_marker="SECRET-LINE-TWO"
passed=0
failed=0

# run_script <app> [VAR=value ...]: runs the script with a clean base environment;
# sets $status, $log and $output_file contents in $output.
run_script() {
  local app="$1"
  shift
  status=0
  : >"${work}/output"
  log="$(env -i PATH="${PATH}" ENVIRONMENT=staging TURBO_VERSION=2.0.0 \
    VITE_API_BASE_URL=https://api.example.test \
    NEXT_PUBLIC_API_BASE_URL=https://api.example.test \
    NEXT_PUBLIC_ADMIN_URL=https://admin.example.test \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=site-key \
    GITHUB_OUTPUT="${work}/output" "$@" bash "${script}" "${app}" 2>&1)" || status=$?
  output="$(cat "${work}/output")"
}

report() { # name ok
  if [ "$2" = yes ]; then
    echo "PASS $1"
    passed=$((passed + 1))
  else
    echo "FAIL $1: exit ${status}, log: ${log}, output: ${output}"
    failed=$((failed + 1))
  fi
}

expect_output() { # name app expected-output [VAR=value ...]
  local name="$1" app="$2" expected="$3"
  shift 3
  run_script "${app}" "$@"
  if [ "${status}" -eq 0 ] && [ "${output}" = "${expected}" ]; then report "${name}" yes; else report "${name}" no; fi
}

expect_failure() { # name app key-in-log [VAR=value ...]
  local name="$1" app="$2" key="$3" ok=yes
  shift 3
  run_script "${app}" "$@"
  [ "${status}" -eq 1 ] || ok=no
  grep -qF -- "::error::${key}" <<<"${log}" || ok=no
  grep -qF -- "staging" <<<"${log}" || ok=no
  grep -qF -- "${secret_marker}" <<<"${log}" && ok=no
  [ -z "${output}" ] || ok=no
  report "${name}" "${ok}"
}

expect_output "cms-api" cms-api "build_args<<ARGS_EOF
TURBO_VERSION=2.0.0
ARGS_EOF"

expect_output "cms-admin" cms-admin "api_url=https://api.example.test
build_args<<ARGS_EOF
TURBO_VERSION=2.0.0
VITE_API_BASE_URL=https://api.example.test
ARGS_EOF"

expect_output "web" web "build_args<<ARGS_EOF
TURBO_VERSION=2.0.0
NEXT_PUBLIC_API_BASE_URL=https://api.example.test
NEXT_PUBLIC_ADMIN_URL=https://admin.example.test
NEXT_PUBLIC_TURNSTILE_SITE_KEY=site-key
ARGS_EOF"

expect_output "web with empty optional keys" web "build_args<<ARGS_EOF
TURBO_VERSION=2.0.0
NEXT_PUBLIC_API_BASE_URL=https://api.example.test
NEXT_PUBLIC_ADMIN_URL=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ARGS_EOF" NEXT_PUBLIC_ADMIN_URL= NEXT_PUBLIC_TURNSTILE_SITE_KEY=

expect_failure "unknown app" mobile "unknown app"
expect_failure "cms-admin without VITE_API_BASE_URL" cms-admin "VITE_API_BASE_URL is not set" VITE_API_BASE_URL=
expect_failure "web without NEXT_PUBLIC_API_BASE_URL" web "NEXT_PUBLIC_API_BASE_URL is not set" NEXT_PUBLIC_API_BASE_URL=
expect_failure "newline in VITE_API_BASE_URL" cms-admin "VITE_API_BASE_URL" "VITE_API_BASE_URL=https://a.test
${secret_marker}"
expect_failure "carriage return in NEXT_PUBLIC_API_BASE_URL" web "NEXT_PUBLIC_API_BASE_URL" "NEXT_PUBLIC_API_BASE_URL=https://a.test$(printf '\r')${secret_marker}"
expect_failure "newline in NEXT_PUBLIC_ADMIN_URL" web "NEXT_PUBLIC_ADMIN_URL" "NEXT_PUBLIC_ADMIN_URL=https://a.test
${secret_marker}"
expect_failure "newline in NEXT_PUBLIC_TURNSTILE_SITE_KEY" web "NEXT_PUBLIC_TURNSTILE_SITE_KEY" "NEXT_PUBLIC_TURNSTILE_SITE_KEY=k
${secret_marker}"
expect_failure "newline in TURBO_VERSION" cms-api "TURBO_VERSION" "TURBO_VERSION=2.0.0
${secret_marker}"

# Without GITHUB_OUTPUT the block goes to stdout
status=0
output="$(env -i PATH="${PATH}" ENVIRONMENT=staging TURBO_VERSION=2.0.0 bash "${script}" cms-api 2>&1)" || status=$?
log="${output}"
if [ "${status}" -eq 0 ] && [ "${output}" = "build_args<<ARGS_EOF
TURBO_VERSION=2.0.0
ARGS_EOF" ]; then report "stdout when GITHUB_OUTPUT is unset" yes; else report "stdout when GITHUB_OUTPUT is unset" no; fi

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

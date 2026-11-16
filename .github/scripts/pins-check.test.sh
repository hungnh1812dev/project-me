#!/usr/bin/env bash
# Tests for pins-check.sh against throwaway repo trees under $TMPDIR.
# Usage: bash .github/scripts/pins-check.test.sh
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pins-check.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/pins-check-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT

passed=0
failed=0

# Writes a consistent tree (turbo 2.0.0, node 24, postgres 17) into $1
write_tree() {
  local root="$1" app
  mkdir -p "${root}/.github/workflows"
  printf '24\n' >"${root}/.nvmrc"
  printf '  "devDependencies": {\n    "turbo": "2.0.0"\n  }\n' >"${root}/package.json"
  printf 'env:\n  # Keep in sync\n  TURBO_VERSION: 2.0.0\n' >"${root}/.github/workflows/ci.yml"
  for app in cms-api web; do
    mkdir -p "${root}/apps/${app}"
    printf 'ARG NODE_IMAGE=node:24.18-alpine\nARG TURBO_VERSION=2.0.0\n' >"${root}/apps/${app}/Dockerfile"
  done
  printf 'ARG POSTGRES_MAJOR=17\n' >>"${root}/apps/cms-api/Dockerfile"
  printf 'services:\n  postgres:\n    image: postgres:17-alpine\n' | tee "${root}/docker-compose.smoke.yml" >"${root}/docker-compose.dev.yml"
  mkdir -p "${root}/apps/cms-api/test/fixtures"
  printf "export const POSTGRES_TEST_IMAGE = 'postgres:17-alpine';\n" >"${root}/apps/cms-api/test/fixtures/Postgres.fixture.ts"
}

# run_case <name> <expected exit> <expected output fragment> <tree setup command...>
run_case() {
  local name="$1" expected_status="$2" expected_text="$3" root output status=0
  shift 3
  root="$(mktemp -d "${work}/tree.XXXXXX")"
  write_tree "${root}"
  "$@" "${root}"
  output="$(bash "${script}" "${root}" 2>&1)" || status=$?
  if [ "${status}" -eq "${expected_status}" ] && grep -qF -- "${expected_text}" <<<"${output}"; then
    echo "PASS ${name}"
    passed=$((passed + 1))
  else
    echo "FAIL ${name}: exit ${status}, output:"
    echo "${output}"
    failed=$((failed + 1))
  fi
}

keep_consistent() { :; }
bump_ci_turbo() { sed -i.bak 's/TURBO_VERSION: 2.0.0/TURBO_VERSION: 2.1.0/' "$1/.github/workflows/ci.yml"; }
bump_dockerfile_turbo() { sed -i.bak 's/TURBO_VERSION=2.0.0/TURBO_VERSION=2.2.0/' "$1/apps/web/Dockerfile"; }
bump_package_turbo() { sed -i.bak 's/"turbo": "2.0.0"/"turbo": "2.3.0"/' "$1/package.json"; }
bump_nvmrc() { printf '26\n' >"$1/.nvmrc"; }
bump_dockerfile_node() { sed -i.bak 's/node:24.18/node:22.1/' "$1/apps/cms-api/Dockerfile"; }
drop_dockerfile_turbo() { sed -i.bak '/TURBO_VERSION/d' "$1/apps/web/Dockerfile"; }
bump_dev_compose_postgres() { sed -i.bak 's/postgres:17/postgres:18/' "$1/docker-compose.dev.yml"; }

run_case "all pins agree" 0 "turbo 2.0.0" keep_consistent
run_case "ci.yml turbo differs" 1 "package.json pins 2.0.0, expected 2.1.0" bump_ci_turbo
run_case "Dockerfile turbo differs" 1 "apps/web/Dockerfile pins 2.2.0" bump_dockerfile_turbo
run_case "package.json turbo differs" 1 "package.json pins 2.3.0" bump_package_turbo
run_case ".nvmrc major differs" 1 "node major: apps/cms-api/Dockerfile pins 24, expected 26" bump_nvmrc
run_case "Dockerfile node differs" 1 "node major: apps/cms-api/Dockerfile pins 22, expected 24" bump_dockerfile_node
run_case "missing turbo pin" 1 "no pin found in apps/web/Dockerfile" drop_dockerfile_turbo
run_case "postgres pins agree" 0 "postgres major 17" keep_consistent
run_case "compose postgres differs" 1 "postgres major: docker-compose.dev.yml pins 18, expected 17" bump_dev_compose_postgres

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

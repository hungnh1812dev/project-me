#!/usr/bin/env bash
# Version pins that must agree across files: Turbo (ci.yml, Dockerfiles, root
# package.json) and the Node major (.nvmrc, Dockerfiles).
# Usage: pins-check.sh [repo-root]    default: the repository this script lives in
# Exits 1 and names every mismatch; prints the agreed pins on success.
set -euo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ci_workflow="${root}/.github/workflows/ci.yml"
root_package="${root}/package.json"
nvmrc="${root}/.nvmrc"

failures=0

fail() {
  echo "::error::$1"
  failures=$((failures + 1))
}

# First capture group of a sed expression over one file; empty when it does not match
extract() {
  sed -nE "s/$1/\1/p" "$2" | head -n 1
}

turbo_pins() {
  local dockerfile
  echo "ci.yml $(extract '^[[:space:]]*TURBO_VERSION:[[:space:]]*([0-9][^[:space:]]*).*' "${ci_workflow}")"
  echo "package.json $(extract '^[[:space:]]*"turbo":[[:space:]]*"([^"]+)".*' "${root_package}")"
  for dockerfile in "${root}"/apps/*/Dockerfile; do
    echo "${dockerfile#"${root}/"} $(extract '^ARG TURBO_VERSION=([^[:space:]]+).*' "${dockerfile}")"
  done
}

node_pins() {
  local dockerfile
  echo ".nvmrc $(sed -E 's/^v?([0-9]+).*/\1/' "${nvmrc}" | head -n 1)"
  for dockerfile in "${root}"/apps/*/Dockerfile; do
    echo "${dockerfile#"${root}/"} $(extract '^ARG NODE_IMAGE=node:([0-9]+).*' "${dockerfile}")"
  done
}

# Reads "<file> <value>" lines; reports empty values and any value that differs from the first
check_agree() {
  local label="$1" first='' file value
  while read -r file value; do
    if [ -z "${value}" ]; then
      fail "${label}: no pin found in ${file}"
    elif [ -z "${first}" ]; then
      first="${value}"
    elif [ "${value}" != "${first}" ]; then
      fail "${label}: ${file} pins ${value}, expected ${first}"
    fi
  done
  if [ "${failures}" -eq 0 ]; then echo "${label} ${first}"; fi
}

check_agree "turbo" < <(turbo_pins)
check_agree "node major" < <(node_pins)

[ "${failures}" -eq 0 ]

#!/usr/bin/env bash
# Backup tools guard for a locally loaded cms-api image (ADR 0025).
# Usage: backup-tools.sh <image> [repo-root]    default root: the repository this script lives in
# Exits 1 and names every failed check unless, inside the image, pg_dump,
# pg_restore and psql report the major pinned by `ARG POSTGRES_MAJOR` in
# apps/cms-api/Dockerfile, age and rclone run, the shell supports pipefail, and
# /app/backup/nightly-backup.sh exists and is not writable by the runtime user.
# Prints the tool versions on success.
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [ -z "${1}" ]; then
  echo "::error::usage: backup-tools.sh <image> [repo-root]" >&2
  exit 2
fi

image="${1}"
root="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
dockerfile="${root}/apps/cms-api/Dockerfile"
script_path=/app/backup/nightly-backup.sh

major="$(sed -nE 's/^ARG POSTGRES_MAJOR=([0-9]+).*/\1/p' "${dockerfile}" | head -n 1)"
if [ -z "${major}" ]; then
  echo "::error::no ARG POSTGRES_MAJOR in ${dockerfile}" >&2
  exit 1
fi

failures=0

fail() {
  echo "::error::${image}: $1"
  failures=$((failures + 1))
}

# Runs a command in the image; prints its first output line
in_image() {
  docker run --rm --entrypoint sh "${image}" -c "$1" 2>&1 | head -n 1
}

for tool in pg_dump pg_restore psql; do
  version="$(in_image "${tool} --version" || true)"
  if grep -qE "[[:space:]]${major}(\.[0-9]+)*([[:space:]]|\$)" <<<"${version}"; then
    echo "${version}"
  else
    fail "${tool} must report major ${major}, got '${version}'"
  fi
done

age_version="$(in_image 'age --version' || true)"
if [ -n "${age_version}" ] && docker run --rm --entrypoint age "${image}" --version >/dev/null 2>&1; then
  echo "age ${age_version}"
else
  fail "age --version does not run"
fi

rclone_version="$(in_image 'rclone version' || true)"
if docker run --rm --entrypoint rclone "${image}" version >/dev/null 2>&1; then
  echo "${rclone_version}"
else
  fail "rclone version does not run"
fi

docker run --rm --entrypoint sh "${image}" -c 'set -o pipefail' >/dev/null 2>&1 || fail "sh does not support set -o pipefail"

docker run --rm --entrypoint sh "${image}" -c "test -f ${script_path}" >/dev/null 2>&1 || fail "${script_path} is missing"

# The image runs as its default non-root user: test -w must fail
if docker run --rm --entrypoint sh "${image}" -c "test -w ${script_path}" >/dev/null 2>&1; then
  fail "${script_path} is writable by the runtime user"
fi

[ "${failures}" -eq 0 ]
echo "${image} backup tools ok (postgres major ${major})"

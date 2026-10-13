#!/usr/bin/env bash
# Non-root guard for a locally loaded image.
# Usage: image-user.sh <image>
# Exits 1 unless the image's Config.User is a numeric, non-zero UID (optionally
# "uid:gid") and `id -u` inside the image prints that same UID. Prints the user
# on success. Numeric matters: Kubernetes runAsNonRoot can only verify a UID.
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "${1}" ]; then
  echo "::error::usage: image-user.sh <image>" >&2
  exit 2
fi

image="${1}"

fail() {
  echo "::error::${image} runs as '${1}'; the final stage must set a numeric non-root USER"
  exit 1
}

if ! user="$(docker image inspect --format '{{.Config.User}}' "${image}")"; then
  echo "::error::cannot inspect ${image}; build it with load: true before running this guard" >&2
  exit 1
fi

# Config.User may be "uid" or "uid:gid"; the UID decides.
uid="${user%%:*}"

case "${uid}" in
  '' | *[!0-9]*) fail "${user}" ;;
esac

# Strip leading zeros so "00" is caught as 0 (10# keeps bash from reading octal).
if [ "$((10#${uid}))" -eq 0 ]; then
  fail "${user}"
fi

if ! runtime_uid="$(docker run --rm --entrypoint id "${image}" -u)"; then
  echo "::error::cannot run 'id -u' in ${image}" >&2
  exit 1
fi

if [ "${runtime_uid}" = "0" ] || [ "${runtime_uid}" != "$((10#${uid}))" ]; then
  fail "${user} (id -u: ${runtime_uid})"
fi

echo "${image} runs as ${user} (id -u: ${runtime_uid})"

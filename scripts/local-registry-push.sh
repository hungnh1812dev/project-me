#!/usr/bin/env bash
# Builds the app images and pushes them to the local k3d registry (docs/deployments/local-registry.md).
# Usage: bash scripts/local-registry-push.sh [cms-api|cms-admin|web ...]    (no argument: all three, in that order)
#   LOCAL_REGISTRY    registry host:port; default k3d-registry.localhost:5001
#   LOCAL_IMAGE_TAG   image tag; default the short head hash, plus -dirty when the working tree has changes
#   Build args come from .github/scripts/build-args.sh run with ENVIRONMENT=local, so it reads TURBO_VERSION,
#   VITE_API_BASE_URL, NEXT_PUBLIC_ADMIN_URL, NEXT_PUBLIC_TURNSTILE_SITE_KEY and APP_ENV (web) from the environment.
# Prints each pushed image ref, one per line. Reads no .env file and never prints a build-arg value.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

default_registry='k3d-registry.localhost:5001'
registry_doc='docs/deployments/local-registry.md'
registry_check_timeout_seconds=5
build_args_script='.github/scripts/build-args.sh'
build_args_environment=local
build_args_start='build_args<<ARGS_EOF'
build_args_end='ARGS_EOF'
all_apps=(cms-api cms-admin web)
usage="usage: local-registry-push.sh [${all_apps[*]}]"

registry="${LOCAL_REGISTRY:-${default_registry}}"

default_tag() {
  local tag
  tag="$(git rev-parse --short HEAD)"
  if [ -n "$(git status --porcelain)" ]; then tag="${tag}-dirty"; fi
  echo "${tag}"
}

die() {
  echo "$1" >&2
  exit 1
}

is_known_app() {
  local candidate
  for candidate in "${all_apps[@]}"; do
    if [ "${candidate}" = "${1}" ]; then return 0; fi
  done
  return 1
}

# Sets build_args to the "--build-arg KEY=value" words of one app; a key with an empty value is skipped.
load_build_args() { # app
  local output line in_block=0
  build_args=()
  output="$(env -u GITHUB_OUTPUT ENVIRONMENT="${build_args_environment}" bash "${build_args_script}" "${1}")" ||
    die "${output}"
  while IFS= read -r line; do
    if [ "${line}" = "${build_args_end}" ]; then in_block=0; fi
    if [ "${in_block}" = 1 ] && [ "${line}" != "${line%%=*}=" ]; then
      build_args+=(--build-arg "${line}")
    fi
    if [ "${line}" = "${build_args_start}" ]; then in_block=1; fi
  done <<<"${output}"
}

check_app() { # app
  is_known_app "${1}" || die "unknown app '${1}'; ${usage}"
  load_build_args "${1}"
  if [ "${1}" = web ] && [[ " ${build_args[*]-} " != *" NEXT_PUBLIC_TURNSTILE_SITE_KEY="* ]]; then
    die "NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set for web"
  fi
  if [ "${1}" = web ] && [[ " ${build_args[*]-} " != *" APP_ENV="* ]]; then
    die "APP_ENV is not set for web"
  fi
}

check_registry() {
  curl -fsS --max-time "${registry_check_timeout_seconds}" "http://${registry}/v2/" >/dev/null 2>&1 ||
    die "registry ${registry} is not reachable; see ${registry_doc}"
}

apps=("$@")
if [ "${#apps[@]}" -eq 0 ]; then apps=("${all_apps[@]}"); fi

for app in "${apps[@]}"; do check_app "${app}"; done
check_registry

tag="${LOCAL_IMAGE_TAG:-$(default_tag)}"
pushed_refs=()
for app in "${apps[@]}"; do
  ref="${registry}/${app}:${tag}"
  load_build_args "${app}"
  docker build -f "apps/${app}/Dockerfile" -t "${ref}" ${build_args[@]+"${build_args[@]}"} "${repo_root}"
  docker push "${ref}"
  pushed_refs+=("${ref}")
done
printf '%s\n' "${pushed_refs[@]}"

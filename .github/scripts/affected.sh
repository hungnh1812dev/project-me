#!/usr/bin/env bash
# Change detection for the CI entrypoint: which apps run checks and build, and
# which get a new image and deploy.
# Usage: EVENT_NAME=push BASE_SHA=<sha> HEAD_SHA=<sha> TURBO_VERSION=<x.y.z> affected.sh
#   TURBO_BIN  optional turbo executable (tests); default `npx -y turbo@$TURBO_VERSION`
# Writes apps, image_apps, any, e2e and <app>_affected / <app>_image (cms_api_*,
# cms_admin_*, web_*) to $GITHUB_OUTPUT, or to stdout when it is unset.
# Without a usable base commit (new branch, force push) every app is affected
# and gets an image. `e2e` is true when any app is affected or a file of the e2e
# suite or its stack changed (E2E_PATHS below). Workflow-file changes add apps to `apps` only, never to
# `image_apps`: .github/workflows/<app>.yml adds that app; ci.yml, _publish.yml
# and .github/scripts/** add all apps.
set -euo pipefail

packages=(cms-admin cms-api web)
# turbo knows the packages by their workspace names
scope="@abyss/"
turbo_packages=("${packages[@]/#/${scope}}")

EVENT_NAME="${EVENT_NAME:-}"
BASE_SHA="${BASE_SHA:-}"
HEAD_SHA="${HEAD_SHA:-}"

if [ -z "${HEAD_SHA}" ]; then
  echo "::error::affected.sh needs HEAD_SHA" >&2
  exit 2
fi
if [ -z "${TURBO_BIN:-}" ] && [ -z "${TURBO_VERSION:-}" ]; then
  echo "::error::affected.sh needs TURBO_VERSION (or TURBO_BIN)" >&2
  exit 2
fi

turbo() {
  if [ -n "${TURBO_BIN:-}" ]; then
    "${TURBO_BIN}" "$@"
  else
    npx -y "turbo@${TURBO_VERSION}" "$@"
  fi
}

# Files outside the apps that the e2e job runs or depends on (git pathspecs)
E2E_PATHS=(apps/e2e scripts/e2e-stack.sh scripts/lib scripts/stack .github/workflows/e2e.yml)

all="$(jq -cn '$ARGS.positional' --args "${packages[@]}")"

if [ -n "${BASE_SHA}" ] && git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  apps="$(turbo query affected \
      --packages "${turbo_packages[@]}" --base "${BASE_SHA}" --head "${HEAD_SHA}" \
    | jq -c --arg scope "${scope}" '[.data.affectedPackages.items[] | select(.path | startswith("apps/")) | .name | ltrimstr($scope)]')"
  # Apps whose build inputs changed (source, package.json, lockfile, Dockerfile; not
  # docs or tests, see build.inputs in turbo.json): only these get a new image and deploy
  image_apps="$(turbo query affected \
      --tasks build --packages "${turbo_packages[@]}" --base "${BASE_SHA}" --head "${HEAD_SHA}" \
    | jq -c --argjson all "${all}" --arg scope "${scope}" '[.data.affectedTasks.items[].package.name | ltrimstr($scope) | select(IN($all[]))] | unique')"

  # Workflow-file routing: checks and build only, so these never reach image_apps
  routed=''
  while IFS= read -r file; do
    case "${file}" in
      .github/workflows/ci.yml | .github/workflows/_publish.yml | .github/scripts/*)
        routed="${routed} ${packages[*]}" ;;
      .github/workflows/*.yml)
        name="${file#.github/workflows/}"
        name="${name%.yml}"
        for app in "${packages[@]}"; do
          if [ "${name}" = "${app}" ]; then routed="${routed} ${app}"; fi
        done ;;
    esac
  done < <(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- .github)
  e2e_files="$(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- "${E2E_PATHS[@]}")"
  if [ -n "${routed}" ]; then
    echo "Workflow files changed; checks and build only for:${routed}"
    # shellcheck disable=SC2086 # word-split the space-separated app list on purpose
    apps="$(jq -cn --argjson apps "${apps}" '$apps + $ARGS.positional | unique' --args ${routed})"
  fi
else
  # New branch (before = 000…) or force push (before is gone): build everything
  echo "::notice::No usable base commit '${BASE_SHA}' for ${EVENT_NAME}; treating all apps as affected"
  apps="${all}"
  image_apps="${all}"
  e2e_files=all
fi
e2e="$(jq -n --argjson apps "${apps}" --arg files "${e2e_files}" '($apps | length > 0) or ($files != "")')"

echo "Affected apps: ${apps}"
echo "Apps to build images for: ${image_apps}"

{
  echo "apps=${apps}"
  echo "image_apps=${image_apps}"
  echo "any=$(jq 'length > 0' <<<"${apps}")"
  echo "e2e=${e2e}"
  for app in "${packages[@]}"; do
    key="${app//-/_}"
    echo "${key}_affected=$(jq --arg app "${app}" 'index($app) != null' <<<"${apps}")"
    echo "${key}_image=$(jq --arg app "${app}" 'index($app) != null' <<<"${image_apps}")"
  done
} >>"${GITHUB_OUTPUT:-/dev/stdout}"

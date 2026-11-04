#!/usr/bin/env bash
# Release set for a repo tag push (ADR 0016 decisions 4 and 5): which deployed apps get an image and a deploy.
# Usage: TAG_NAME=v<x.y.z> HEAD_SHA=<sha> [MAIN_REF=origin/main] TURBO_VERSION=<x.y.z> release-apps.sh
#   TURBO_BIN  optional turbo executable (tests), passed on to affected.sh
# Fails unless TAG_NAME is v + the root package.json version at HEAD_SHA and HEAD_SHA is the MAIN_REF tip (a release comes from the current origin/main tip only);
# the root version and every released app version must be x.y.z.
# The previous release is the nearest v* tag reachable from HEAD_SHA^. An app is released when its version differs
# from its version at that tag, or when there is no previous tag.
# Writes release_version, previous_tag, <app>_affected, <app>_image and <app>_version (cms_api_*, cms_admin_*, web_*)
# to $GITHUB_OUTPUT, or to stdout when it is unset.
set -euo pipefail

apps=(cms-api cms-admin web)
semver_pattern='^[0-9]+\.[0-9]+\.[0-9]+$'

TAG_NAME="${TAG_NAME:-}"
HEAD_SHA="${HEAD_SHA:-}"
MAIN_REF="${MAIN_REF:-origin/main}"

if [ -z "${TAG_NAME}" ] || [ -z "${HEAD_SHA}" ]; then
  echo "::error::release-apps.sh needs TAG_NAME and HEAD_SHA" >&2
  exit 2
fi

version_at() { # <ref> <package.json path>: version, or empty when the file does not exist at <ref>
  git show "$1:$2" 2>/dev/null | jq -r '.version // empty' || true
}

release_version="$(version_at "${HEAD_SHA}" package.json)"
if [ "${TAG_NAME}" != "v${release_version}" ]; then
  echo "::error::Tag '${TAG_NAME}' does not match the root package.json version 'v${release_version}' at ${HEAD_SHA}" >&2
  exit 1
fi
if ! [[ "${release_version}" =~ ${semver_pattern} ]]; then
  echo "::error::Root version '${release_version}' is not x.y.z" >&2
  exit 1
fi
main_tip="$(git rev-parse --verify --quiet "${MAIN_REF}^{commit}" || true)"
head_commit="$(git rev-parse --verify --quiet "${HEAD_SHA}^{commit}" || true)"
if [ -z "${main_tip}" ] || [ "${main_tip}" != "${head_commit}" ]; then
  echo "::error::Tagged commit ${HEAD_SHA} is not the ${MAIN_REF} tip (${main_tip:-missing}); a release comes from the current main tip only" >&2
  exit 1
fi

previous_tag="$(git describe --tags --abbrev=0 --match 'v[0-9]*' "${HEAD_SHA}^" 2>/dev/null || true)"

# What changed since the previous release, to warn about a build-input change without a version bump
changed_image_apps='[]'
if [ -n "${previous_tag}" ]; then
  affected_output="$(mktemp)"
  trap 'rm -f "${affected_output}"' EXIT
  EVENT_NAME=push BASE_SHA="${previous_tag}" GITHUB_OUTPUT="${affected_output}" \
    bash "$(dirname "${BASH_SOURCE[0]}")/affected.sh" >&2
  changed_image_apps="$(sed -n 's/^image_apps=//p' "${affected_output}")"
fi

outputs=("release_version=${release_version}" "previous_tag=${previous_tag}")
for app in "${apps[@]}"; do
  key="${app//-/_}"
  version="$(version_at "${HEAD_SHA}" "apps/${app}/package.json")"
  previous_version=''
  if [ -n "${previous_tag}" ]; then previous_version="$(version_at "${previous_tag}" "apps/${app}/package.json")"; fi

  is_released=false
  if [ -z "${previous_tag}" ] || [ "${version}" != "${previous_version}" ]; then is_released=true; fi
  if [ "${is_released}" = true ] && ! [[ "${version}" =~ ${semver_pattern} ]]; then
    echo "::error::${app} version '${version}' is not x.y.z" >&2
    exit 1
  fi

  if [ "${is_released}" = false ] && jq -e --arg app "${app}" 'index($app) != null' <<<"${changed_image_apps}" >/dev/null; then
    echo "::warning::${app} build inputs changed since ${previous_tag} but its version is still ${version}; no image is published for it" >&2
  fi
  outputs+=("${key}_affected=${is_released}" "${key}_image=${is_released}" "${key}_version=${version}")
done

printf '%s\n' "${outputs[@]}" >>"${GITHUB_OUTPUT:-/dev/stdout}"
echo "Release ${TAG_NAME}: previous '${previous_tag:-none}'" >&2

#!/usr/bin/env bash
# Local release steps for the release-tag skill (ADR 0016 decision 8). The skill asks the questions; this script does the
# deterministic work and never pushes.
# Usage:
#   release.sh changes
#   release.sh bump --repo <major|minor|patch> [--app <app>=<major|minor|patch>]...
#   release.sh tag
#   TURBO_BIN      optional turbo executable (tests); default `npx -y turbo@$TURBO_VERSION`
#   TURBO_VERSION  turbo version for affected.sh; default: the version pinned in .github/workflows/ci.yml
# changes: JSON on stdout: previous_tag, repo_version, apps.<app>.{version,is_affected,is_image_affected,commits}, repo_commits.
# bump:    refused on main; writes only the "version" field of the root and the named apps' package.json; prints old -> new JSON.
# tag:     only on main at origin/main with a clean tree; creates annotated v<root version> and <app>@<version> for each app
#          whose version differs from the previous release (every app on the first release), then prints the push commands.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

release_branch=main
release_remote=origin
repo_tag_glob='v[0-9]*'
semver_pattern='^[0-9]+\.[0-9]+\.[0-9]+$'
levels=(major minor patch)
deployed_apps=(cms-api cms-admin web)
apps=("${deployed_apps[@]}" e2e)

# Source paths whose commits belong to an app: the app folder plus the shared packages it uses
paths_of_app() {
  case "$1" in
    cms-api) echo "apps/cms-api packages/base-config" ;;
    cms-admin | web) echo "apps/$1 packages/base-config packages/form-commons" ;;
    *) echo "apps/$1" ;;
  esac
}

fail() { echo "release.sh: $*" >&2; exit 1; }

is_in() { # <word> <list...>
  local word="$1" item
  shift
  for item in "$@"; do if [ "${item}" = "${word}" ]; then return 0; fi; done
  return 1
}

version_at() { # <ref> <package.json path>: version, or empty when the file does not exist at <ref>
  git show "$1:$2" 2>/dev/null | jq -r '.version // empty' || true
}

package_file_of() { if [ "$1" = repo ]; then echo package.json; else echo "apps/$1/package.json"; fi; }

previous_release_tag() { git describe --tags --abbrev=0 --match "${repo_tag_glob}" HEAD 2>/dev/null || true; }

latest_release_tag() { git tag -l "${repo_tag_glob}" --sort=-v:refname | head -n 1; }

require_clean_tree() { [ -z "$(git status --porcelain)" ] || fail "the working tree is not clean"; }

# ---- changes -----------------------------------------------------------------------------------------------------------

cmd_changes() {
  local previous_tag range
  previous_tag="$(previous_release_tag)"
  range=HEAD
  if [ -n "${previous_tag}" ]; then range="${previous_tag}..HEAD"; fi

  affected_output="$(mktemp)" # global: the EXIT trap runs after this function returns
  trap 'rm -f "${affected_output}"' EXIT
  EVENT_NAME=push BASE_SHA="${previous_tag}" HEAD_SHA="$(git rev-parse HEAD)" \
    TURBO_VERSION="${TURBO_VERSION:-$(sed -n 's/^ *TURBO_VERSION: *//p' .github/workflows/ci.yml | head -n 1)}" \
    GITHUB_OUTPUT="${affected_output}" bash .github/scripts/affected.sh >&2

  # One line per commit: sha, subject, then the apps it reaches (space separated, may be empty)
  local lines='' sha subject files app path reached
  while read -r sha; do
    subject="$(git log -1 --format=%s "${sha}")"
    files="$(git diff-tree --root -r -m --first-parent --name-only --no-commit-id "${sha}")"
    reached=''
    for app in "${apps[@]}"; do
      for path in $(paths_of_app "${app}"); do
        if grep -q "^${path}/" <<<"${files}"; then reached="${reached} ${app}"; break; fi
      done
    done
    lines+="${sha}"$'\t'"${subject}"$'\t'"${reached# }"$'\n'
  done < <(git rev-list "${range}")

  local json
  json="$(jq -Rn --arg previous_tag "${previous_tag}" --arg repo_version "$(version_at HEAD package.json)" \
    --argjson apps "$(jq -cn '$ARGS.positional' --args "${apps[@]}")" '
    [inputs | select(length > 0) | split("\t") | {sha: .[0], subject: .[1], apps: (.[2] // "" | split(" ") | map(select(. != "")))}] as $commits
    | {previous_tag: $previous_tag, repo_version: $repo_version,
       apps: ($apps | map(. as $app | {key: $app, value: {commits: [$commits[] | select(.apps | index($app)) | {sha, subject}]}}) | from_entries),
       repo_commits: [$commits[] | select(.apps | length == 0) | {sha, subject}]}' <<<"${lines}")"

  local key flags_json='{}' app_version is_affected is_image
  for app in "${apps[@]}"; do
    key="${app//-/_}"
    app_version="$(version_at HEAD "$(package_file_of "${app}")")"
    if is_in "${app}" "${deployed_apps[@]}"; then
      is_affected="$(sed -n "s/^${key}_affected=//p" "${affected_output}")"
      is_image="$(sed -n "s/^${key}_image=//p" "${affected_output}")"
    else
      is_affected="$(jq -r --arg app "${app}" '.apps[$app].commits | length > 0' <<<"${json}")"
      is_image=false
    fi
    flags_json="$(jq -c --arg app "${app}" --arg version "${app_version}" --argjson is_affected "${is_affected:-false}" \
      --argjson is_image "${is_image:-false}" \
      '.[$app] = {version: $version, is_affected: $is_affected, is_image_affected: $is_image}' <<<"${flags_json}")"
  done
  jq --argjson flags "${flags_json}" '.apps |= with_entries(.value = ($flags[.key] + .value))' <<<"${json}"
}

# ---- bump --------------------------------------------------------------------------------------------------------------

next_version() { # <version> <level>
  local major minor patch
  IFS=. read -r major minor patch <<<"$1"
  case "$2" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
  esac
}

write_version() { # <package.json path> <new version>: replaces the first "version" value only, formatting kept
  NEW_VERSION="$2" perl -pi -e 'if (!$done && s/("version"\s*:\s*")[^"]*(")/$1$ENV{NEW_VERSION}$2/) { $done = 1 }' "$1"
}

cmd_bump() {
  local repo_level='' app_names=() app_levels=() arg name level
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo) repo_level="${2:-}"; shift 2 || fail "--repo needs a level" ;;
      --app)
        arg="${2:-}"; shift 2 || fail "--app needs <app>=<level>"
        name="${arg%%=*}"; level="${arg#*=}"
        [ "${name}" != "${arg}" ] || fail "--app needs <app>=<level>, got '${arg}'"
        is_in "${name}" "${apps[@]}" || fail "unknown app '${name}'"
        is_in "${level}" "${levels[@]}" || fail "unknown level '${level}' for ${name}"
        app_names+=("${name}"); app_levels+=("${level}") ;;
      *) fail "unknown argument '$1'" ;;
    esac
  done
  is_in "${repo_level}" "${levels[@]}" || fail "--repo must be one of: ${levels[*]}"
  [ "$(git rev-parse --abbrev-ref HEAD)" != "${release_branch}" ] || fail "bump is refused on ${release_branch}; run it on develop"
  require_clean_tree

  local latest_tag root_version
  latest_tag="$(latest_release_tag)"
  root_version="$(version_at HEAD package.json)"
  if [ -n "${latest_tag}" ] && [ "${root_version}" != "${latest_tag#v}" ] && ! git rev-parse -q --verify "refs/tags/v${root_version}" >/dev/null; then
    fail "unfinished release: root version ${root_version} is newer than ${latest_tag} and has no tag; tag it on ${release_branch} first"
  fi

  local result old new i
  old="${root_version}"
  [[ "${old}" =~ ${semver_pattern} ]] || fail "root version '${old}' is not x.y.z"
  new="$(next_version "${old}" "${repo_level}")"
  write_version package.json "${new}"
  result="$(jq -cn --arg old "${old}" --arg new "${new}" '{repo: {old: $old, new: $new}, apps: {}}')"
  for i in "${!app_names[@]}"; do
    name="${app_names[$i]}"
    old="$(version_at HEAD "$(package_file_of "${name}")")"
    [[ "${old}" =~ ${semver_pattern} ]] || fail "${name} version '${old}' is not x.y.z"
    new="$(next_version "${old}" "${app_levels[$i]}")"
    write_version "$(package_file_of "${name}")" "${new}"
    result="$(jq -c --arg app "${name}" --arg old "${old}" --arg new "${new}" '.apps[$app] = {old: $old, new: $new}' <<<"${result}")"
  done
  echo "${result}"
}

# ---- tag ---------------------------------------------------------------------------------------------------------------

cmd_tag() {
  [ "$(git rev-parse --abbrev-ref HEAD)" = "${release_branch}" ] || fail "tag runs on ${release_branch} only"
  git fetch "${release_remote}" "${release_branch}" --tags >&2 || fail "cannot fetch ${release_remote} ${release_branch}"
  [ "$(git rev-parse HEAD)" = "$(git rev-parse "${release_remote}/${release_branch}")" ] \
    || fail "HEAD is not ${release_remote}/${release_branch}; pull or push the merge first"
  require_clean_tree

  local version tag_name previous_tag head_sha
  version="$(version_at HEAD package.json)"
  tag_name="v${version}"
  git rev-parse -q --verify "refs/tags/${tag_name}" >/dev/null && fail "tag ${tag_name} already exists"
  grep -qE "^## ${version//./\\.}( |$)" CHANGELOG.md || fail "CHANGELOG.md has no '## ${version}' heading"
  head_sha="$(git rev-parse HEAD)"
  previous_tag="$(previous_release_tag)"
  TAG_NAME="${tag_name}" HEAD_SHA="${head_sha}" MAIN_REF="${release_remote}/${release_branch}" GITHUB_OUTPUT=/dev/null \
    TURBO_VERSION="${TURBO_VERSION:-$(sed -n 's/^ *TURBO_VERSION: *//p' .github/workflows/ci.yml | head -n 1)}" \
    bash .github/scripts/release-apps.sh >&2 || fail "release-apps.sh refused ${tag_name}"

  local app app_version previous_version app_tags=() app_tag
  for app in "${apps[@]}"; do
    app_version="$(version_at HEAD "$(package_file_of "${app}")")"
    previous_version=''
    if [ -n "${previous_tag}" ]; then previous_version="$(version_at "${previous_tag}" "$(package_file_of "${app}")")"; fi
    if [ -z "${previous_tag}" ] || [ "${app_version}" != "${previous_version}" ]; then
      app_tag="${app}@${app_version}"
      git rev-parse -q --verify "refs/tags/${app_tag}" >/dev/null && fail "tag ${app_tag} already exists"
      app_tags+=("${app_tag}")
    fi
  done

  git tag -a "${tag_name}" -m "Release ${version}" "${head_sha}"
  for app_tag in "${app_tags[@]}"; do git tag -a "${app_tag}" -m "Release ${app_tag}" "${head_sha}"; done
  echo "Created: ${tag_name} ${app_tags[*]:-}"
  echo "Push the repo tag first (it starts the release run):  git push ${release_remote} ${tag_name}"
  if [ "${#app_tags[@]}" -gt 0 ]; then echo "Then the app tags:  git push ${release_remote} ${app_tags[*]}"; fi
}

case "${1:-}" in
  changes) shift; cmd_changes "$@" ;;
  bump) shift; cmd_bump "$@" ;;
  tag) shift; cmd_tag "$@" ;;
  *) fail "usage: release.sh changes | bump --repo <level> [--app <app>=<level>]... | tag" ;;
esac

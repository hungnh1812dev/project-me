#!/usr/bin/env bash
# Pipeline depth per branch for the CI entrypoint: what each branch runs.
#   develop: checks only. staging: checks + build. main: checks + build + an image built but not pushed.
# Usage: EVENT_NAME=push REF_TYPE=branch REF_NAME=<branch> CMS_API_IMAGE=<bool> CMS_ADMIN_IMAGE=<bool> \
#        WEB_IMAGE=<bool> TURBO_VERSION=<x.y.z> IMAGE_PREFIX=<registry/path> pipeline-target.sh
# A tag push (REF_TYPE=tag) builds and pushes the release set to production and bumps the deploy repo main.
# Writes branch, should_build, should_build_image, should_push_image, environment, deploy_ref,
# <app>_matrix (cms_api_*, cms_admin_*, web_*), turbo_version and image_prefix to $GITHUB_OUTPUT,
# or to stdout when it is unset. An app without a new image gets an empty matrix.
set -euo pipefail

EVENT_NAME="${EVENT_NAME:-}"
REF_TYPE="${REF_TYPE:-branch}"
REF_NAME="${REF_NAME:-}"
CMS_API_IMAGE="${CMS_API_IMAGE:-false}"
CMS_ADMIN_IMAGE="${CMS_ADMIN_IMAGE:-false}"
WEB_IMAGE="${WEB_IMAGE:-false}"
TURBO_VERSION="${TURBO_VERSION:-}"
IMAGE_PREFIX="${IMAGE_PREFIX:-}"

# The one table: branch -> depth, image platforms, GitHub Environment, deployment repo branch.
# A new branch or depth is one line here.
if [ "$REF_TYPE" = tag ]; then
  should_build=true; should_build_image=true; platforms='["linux/amd64"]'; environment=production; deploy_ref=main; should_push_image=true
else
  should_push_image=false
  case "$REF_NAME" in
  develop) should_build=false; should_build_image=false; platforms='[]';              environment='';           deploy_ref='' ;;
  staging) should_build=true;  should_build_image=false; platforms='[]';              environment='';           deploy_ref='' ;;
  main)    should_build=true;  should_build_image=true;  platforms='["linux/amd64"]'; environment=production;   deploy_ref='' ;; # x86_64 Ubuntu
  *) echo "::error::No deploy target for branch '$REF_NAME'" >&2; exit 1 ;;
  esac
fi

# One image job per platform, each on a native runner. A new platform needs one line here.
runner_for() {
  case "$1" in
    amd64) echo ubuntu-24.04 ;;
    *) echo "::error::No runner for platform '$1'" >&2; return 1 ;;
  esac
}

matrix_for() {
  local wanted_platforms='[]'
  if [ "$1" = true ]; then wanted_platforms=$platforms; fi
  local platform arch runner entries=()
  for platform in $(jq -r '.[]' <<<"$wanted_platforms"); do
    arch=${platform#*/}
    runner=$(runner_for "$arch") || return 1
    entries+=("$(jq -cn --arg platform "$platform" --arg arch "$arch" --arg runner "$runner" '{platform: $platform, arch: $arch, runner: $runner}')")
  done
  if [ "${#entries[@]}" -eq 0 ]; then echo '{"include":[]}'; return; fi
  printf '%s\n' "${entries[@]}" | jq -cs '{include: .}'
}

cms_api_matrix=$(matrix_for "$CMS_API_IMAGE")
cms_admin_matrix=$(matrix_for "$CMS_ADMIN_IMAGE")
web_matrix=$(matrix_for "$WEB_IMAGE")

{
  echo "branch=$REF_NAME"
  echo "should_build=$should_build"
  echo "should_build_image=$should_build_image"
  echo "should_push_image=$should_push_image"
  echo "environment=$environment"
  echo "deploy_ref=$deploy_ref"
  echo "cms_api_matrix=$cms_api_matrix"
  echo "cms_admin_matrix=$cms_admin_matrix"
  echo "web_matrix=$web_matrix"
  echo "turbo_version=$TURBO_VERSION"
  echo "image_prefix=$IMAGE_PREFIX"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "Target: $REF_NAME ($REF_TYPE, $EVENT_NAME), build=$should_build, image=$should_build_image, push=$should_push_image" >&2

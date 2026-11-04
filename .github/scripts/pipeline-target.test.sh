#!/usr/bin/env bash
# Tests for pipeline-target.sh: one case per branch and the tag, the unknown-branch failure, empty matrices.
# Usage: bash .github/scripts/pipeline-target.test.sh
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pipeline-target.sh"
passed=0
failed=0

# run_script [VAR=value ...]: clean environment; sets $status and $output (stdout).
run_script() {
  status=0
  output="$(env -i PATH="${PATH}" EVENT_NAME=push REF_TYPE=branch TURBO_VERSION=2.0.0 IMAGE_PREFIX=ghcr.io/o/r \
    CMS_API_IMAGE=true CMS_ADMIN_IMAGE=false WEB_IMAGE=true "$@" bash "${script}" 2>/dev/null)" || status=$?
}

check() { # name condition-result(yes|no)
  if [ "$2" = yes ]; then
    echo "PASS $1"; passed=$((passed + 1))
  else
    echo "FAIL $1: exit ${status}, output: ${output}"; failed=$((failed + 1))
  fi
}

has() { grep -qxF "$1" <<<"$output" && echo yes || echo no; }

run_script REF_NAME=develop
check "develop: no build, no image, no push, no environment" \
  "$([ "$(has should_build=false)$(has should_build_image=false)$(has should_push_image=false)$(has environment=)" = yesyesyesyes ] && echo yes || echo no)"
check "develop: empty matrices" "$(has 'cms_api_matrix={"include":[]}')"

run_script REF_NAME=staging
check "staging: builds, no image, no push, no environment" \
  "$([ "$(has should_build=true)$(has should_build_image=false)$(has should_push_image=false)$(has environment=)" = yesyesyesyes ] && echo yes || echo no)"
check "staging: empty matrices" "$(has 'web_matrix={"include":[]}')"

run_script REF_NAME=main
check "main: builds an unpushed image in production" \
  "$([ "$(has should_build=true)$(has should_build_image=true)$(has should_push_image=false)$(has environment=production)$(has deploy_ref=)" = yesyesyesyesyes ] && echo yes || echo no)"
check "main: app with a new image gets a matrix" \
  "$(has 'cms_api_matrix={"include":[{"platform":"linux/amd64","arch":"amd64","runner":"ubuntu-24.04"}]}')"
check "main: app without a new image gets an empty matrix" "$(has 'cms_admin_matrix={"include":[]}')"
check "main: passes turbo version and image prefix through" \
  "$([ "$(has turbo_version=2.0.0)$(has image_prefix=ghcr.io/o/r)" = yesyes ] && echo yes || echo no)"

run_script REF_TYPE=tag REF_NAME=v1.2.3
check "tag: builds and pushes to production, deploys to main" \
  "$([ "$(has should_build=true)$(has should_build_image=true)$(has should_push_image=true)$(has environment=production)$(has deploy_ref=main)" = yesyesyesyesyes ] && echo yes || echo no)"
check "tag: app with a new image gets a matrix" \
  "$(has 'cms_api_matrix={"include":[{"platform":"linux/amd64","arch":"amd64","runner":"ubuntu-24.04"}]}')"

run_script REF_NAME=feature-x
check "unknown branch fails" "$([ "$status" -ne 0 ] && [ -z "$output" ] && echo yes || echo no)"

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

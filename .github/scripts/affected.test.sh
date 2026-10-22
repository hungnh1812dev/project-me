#!/usr/bin/env bash
# Routing tests for affected.sh.
# Usage: bash .github/scripts/affected.test.sh
# Builds a throwaway git repo under $TMPDIR and runs affected.sh against fixed
# base/head pairs with a stub turbo (TURBO_BIN). The stub derives turbo's JSON
# from `git diff`: a change under apps/<app>/ affects that app, and only
# non-docs, non-test files count as build inputs (mirrors build.inputs).
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/affected.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/affected-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT

repo="${work}/repo"
stub="${work}/turbo"
out="${work}/github_output"
passed=0
failed=0

cat >"${stub}" <<'STUB'
#!/usr/bin/env bash
# Stub for `turbo query affected [--tasks build] --packages ... --base B --head H`
# (like turbo with --packages, it never reports apps/e2e: that package is not in the list)
set -euo pipefail
tasks='' base='' head=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tasks) tasks="$2"; shift 2 ;;
    --base) base="$2"; shift 2 ;;
    --head) head="$2"; shift 2 ;;
    *) shift ;;
  esac
done
files="$(git diff --name-only "${base}" "${head}")"
if [ -z "${tasks}" ]; then
  # Includes a non-app package so the script's apps/ filter is exercised
  printf '%s\n' "${files}" | jq -R -s -c '
    [split("\n")[] | select(startswith("apps/") or startswith("packages/")) | select(startswith("apps/e2e/") | not)
     | split("/")[0:2] | {name: ("@abyss/" + .[1]), path: join("/")}] | unique
    | {data: {affectedPackages: {items: .}}}'
else
  printf '%s\n' "${files}" | jq -R -s -c '
    [split("\n")[] | select(startswith("apps/")) | select(startswith("apps/e2e/") | not)
     | select((endswith(".md") or test("/test/") or test("\\.test\\.")) | not)
     | split("/")[1] | {package: {name: ("@abyss/" + .)}}] | unique
    | {data: {affectedTasks: {items: .}}}'
fi
STUB
chmod +x "${stub}"

git init -q "${repo}"
cd "${repo}"
git config user.email test@example.test
git config user.name test
git config commit.gpgsign false
mkdir -p apps/cms-admin/src apps/cms-api/test apps/web packages/form-commons .github/workflows .github/scripts scripts
touch README.md apps/cms-admin/src/main.ts apps/cms-api/test/app.e2e-spec.ts apps/web/index.ts \
  packages/form-commons/index.ts .github/workflows/ci.yml .github/workflows/_publish.yml \
  .github/workflows/web.yml .github/scripts/x.sh scripts/smoke.sh
git add -A
git commit -q -m init

# commit_change <file...>: appends to each file, commits, prints "<base> <head>"
commit_change() {
  local base f
  base="$(git rev-parse HEAD)"
  for f in "$@"; do echo "change" >>"${f}"; done
  git add -A
  git commit -q -m "change $*"
  echo "${base} $(git rev-parse HEAD)"
}

# run_case <name> <base> <head> <expected key=value...>
run_case() {
  local name="$1" base="$2" head="$3" kv key want got ok=1
  shift 3
  : >"${out}"
  if ! EVENT_NAME=push BASE_SHA="${base}" HEAD_SHA="${head}" TURBO_BIN="${stub}" \
    GITHUB_OUTPUT="${out}" bash "${script}" >"${work}/log" 2>&1; then
    echo "FAIL ${name}: affected.sh exited non-zero"
    sed 's/^/  | /' "${work}/log"
    failed=$((failed + 1))
    return
  fi
  for kv in "$@"; do
    key="${kv%%=*}"
    want="${kv#*=}"
    got="$(sed -n "s/^${key}=//p" "${out}")"
    if [ "${got}" != "${want}" ]; then
      echo "FAIL ${name}: ${key} = '${got}', want '${want}'"
      ok=0
    fi
  done
  if [ "${ok}" -eq 1 ]; then
    echo "PASS ${name}"
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
}

none_affected=(cms_api_affected=false cms_admin_affected=false web_affected=false)
no_images=(cms_api_image=false cms_admin_image=false web_image=false)
all='["cms-admin","cms-api","web"]'

read -r b h <<<"$(commit_change apps/cms-admin/src/main.ts)"
run_case "cms-admin only" "${b}" "${h}" \
  'apps=["cms-admin"]' 'image_apps=["cms-admin"]' any=true \
  cms_admin_affected=true cms_admin_image=true \
  cms_api_affected=false cms_api_image=false web_affected=false web_image=false

read -r b h <<<"$(commit_change README.md)"
run_case "README only" "${b}" "${h}" \
  'apps=[]' 'image_apps=[]' any=false "${none_affected[@]}" "${no_images[@]}"

read -r b h <<<"$(commit_change apps/cms-api/test/app.e2e-spec.ts)"
run_case "cms-api tests only" "${b}" "${h}" \
  'apps=["cms-api"]' 'image_apps=[]' any=true \
  cms_api_affected=true cms_admin_affected=false web_affected=false "${no_images[@]}"

read -r b h <<<"$(commit_change packages/form-commons/index.ts)"
run_case "non-app package only" "${b}" "${h}" \
  'apps=[]' 'image_apps=[]' any=false "${none_affected[@]}" "${no_images[@]}"

read -r b h <<<"$(commit_change .github/workflows/web.yml)"
run_case "web.yml" "${b}" "${h}" \
  'apps=["web"]' 'image_apps=[]' any=true \
  web_affected=true cms_api_affected=false cms_admin_affected=false "${no_images[@]}"

read -r b h <<<"$(commit_change .github/workflows/_publish.yml)"
run_case "_publish.yml" "${b}" "${h}" \
  "apps=${all}" 'image_apps=[]' any=true \
  cms_api_affected=true cms_admin_affected=true web_affected=true "${no_images[@]}"

read -r b h <<<"$(commit_change .github/workflows/ci.yml)"
run_case "ci.yml" "${b}" "${h}" \
  "apps=${all}" 'image_apps=[]' any=true "${no_images[@]}"

read -r b h <<<"$(commit_change .github/scripts/x.sh)"
run_case ".github/scripts/**" "${b}" "${h}" \
  "apps=${all}" 'image_apps=[]' any=true "${no_images[@]}"

read -r b h <<<"$(commit_change apps/cms-admin/src/main.ts .github/workflows/web.yml)"
run_case "cms-admin source + web.yml" "${b}" "${h}" \
  'apps=["cms-admin","web"]' 'image_apps=["cms-admin"]' any=true \
  cms_admin_image=true web_affected=true web_image=false cms_api_affected=false

# A script that only local smoke uses affects no app
read -r b h <<<"$(commit_change scripts/smoke.sh)"
run_case "scripts/smoke.sh only" "${b}" "${h}" 'apps=[]' any=false

h="$(git rev-parse HEAD)"
run_case "no base, zero SHA" 0000000000000000000000000000000000000000 "${h}" \
  "apps=${all}" "image_apps=${all}" any=true \
  cms_api_affected=true cms_admin_affected=true web_affected=true \
  cms_api_image=true cms_admin_image=true web_image=true

run_case "no base, empty" '' "${h}" \
  "apps=${all}" "image_apps=${all}" any=true cms_admin_image=true

run_case "no base, unknown commit" 1234567890123456789012345678901234567890 "${h}" \
  "apps=${all}" "image_apps=${all}" any=true web_image=true

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

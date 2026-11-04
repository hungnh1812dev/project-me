#!/usr/bin/env bash
# Tests for release-apps.sh: first release, one app bumped, no app bumped, tag/version mismatch, tag off the main tip, bad semver,
# stale-version warning. Usage: bash .github/scripts/release-apps.test.sh
# Builds a throwaway git repo under $TMPDIR; a stub turbo (TURBO_BIN) derives its JSON from `git diff`
# like the stub in affected.test.sh.
set -euo pipefail

scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/release-apps-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
repo="${work}/repo"
stub="${work}/turbo"
passed=0
failed=0

cat >"${stub}" <<'STUB'
#!/usr/bin/env bash
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
  printf '%s\n' "${files}" | jq -R -s -c '
    [split("\n")[] | select(startswith("apps/")) | split("/")[0:2] | {name: ("@abyss/" + .[1]), path: join("/")}] | unique
    | {data: {affectedPackages: {items: .}}}'
else
  printf '%s\n' "${files}" | jq -R -s -c '
    [split("\n")[] | select(startswith("apps/")) | select(endswith("package.json") or endswith(".ts"))
     | split("/")[1] | {package: {name: ("@abyss/" + .)}}] | unique
    | {data: {affectedTasks: {items: .}}}'
fi
STUB
chmod +x "${stub}"

git init -q -b main "${repo}"
cd "${repo}"
git config user.email test@example.test
git config user.name test
git config commit.gpgsign false
mkdir -p apps/cms-api apps/cms-admin apps/web .github/scripts
cp "${scripts_dir}/affected.sh" .github/scripts/
cp "${scripts_dir}/release-apps.sh" .github/scripts/

write_versions() { # root cms-api cms-admin web
  jq -n --arg v "$1" '{version: $v}' >package.json
  jq -n --arg v "$2" '{version: $v}' >apps/cms-api/package.json
  jq -n --arg v "$3" '{version: $v}' >apps/cms-admin/package.json
  jq -n --arg v "$4" '{version: $v}' >apps/web/package.json
}
commit() { git add -A && git commit -qm "$1" && git rev-parse HEAD; }

write_versions 0.0.2 0.0.1 0.0.1 0.0.1
first=$(commit first)

run_release() { # tag sha [main_ref, default: sha itself, i.e. the tip]: sets $status, $output (stdout), $errors (stderr)
  status=0
  errors="$(mktemp -p "${work}")"
  output="$(env -i PATH="${PATH}" TAG_NAME="$1" HEAD_SHA="$2" MAIN_REF="${3:-$2}" TURBO_BIN="${stub}" \
    bash .github/scripts/release-apps.sh 2>"${errors}")" || status=$?
}
check() { # name yes|no
  if [ "$2" = yes ]; then echo "PASS $1"; passed=$((passed + 1)); else echo "FAIL $1: exit ${status}, output: ${output}, stderr: $(cat "${errors}")"; failed=$((failed + 1)); fi
}
has() { grep -qxF "$1" <<<"$output" && echo yes || echo no; }

run_release v0.0.2 "${first}"
check "first release: every deployed app released" \
  "$([ "$(has cms_api_image=true)$(has cms_admin_image=true)$(has web_image=true)$(has previous_tag=)$(has release_version=0.0.2)" = yesyesyesyesyes ] && echo yes || echo no)"
check "first release: versions reported" "$([ "$(has cms_api_version=0.0.1)$(has web_affected=true)" = yesyes ] && echo yes || echo no)"
git tag v0.0.2 "${first}"

echo 'x' >apps/web/a.ts
write_versions 0.0.3 0.0.1 0.0.1 0.0.2
second=$(commit "bump web")
run_release v0.0.3 "${second}"
check "one app bumped: only that app released" \
  "$([ "$(has web_image=true)$(has web_version=0.0.2)$(has cms_api_image=false)$(has cms_admin_affected=false)$(has previous_tag=v0.0.2)" = yesyesyesyesyes ] && echo yes || echo no)"
check "one app bumped: no warning" "$([ -z "$(grep -F '::warning::' "${errors}" || true)" ] && echo yes || echo no)"
git tag v0.0.3 "${second}"

write_versions 0.0.4 0.0.1 0.0.1 0.0.2
third=$(commit "repo only")
run_release v0.0.4 "${third}"
check "no app bumped: nothing released" \
  "$([ "$(has cms_api_image=false)$(has cms_admin_image=false)$(has web_image=false)$(has web_affected=false)" = yesyesyesyes ] && echo yes || echo no)"
git tag v0.0.4 "${third}"

echo 'y' >apps/cms-api/a.ts
write_versions 0.0.5 0.0.1 0.0.1 0.0.2
fourth=$(commit "cms-api changed, version kept")
run_release v0.0.5 "${fourth}"
check "stale version: warns for the app, releases nothing" \
  "$([ "$status" -eq 0 ] && grep -qF '::warning::cms-api build inputs changed' "${errors}" && [ "$(has cms_api_image=false)" = yes ] && echo yes || echo no)"

run_release v0.0.9 "${fourth}"
check "tag/version mismatch fails" "$([ "$status" -ne 0 ] && grep -qF '::error::' "${errors}" && echo yes || echo no)"

write_versions 0.0.6 0.0.1 abc 0.0.2
fifth=$(commit "bad app version")
run_release v0.0.6 "${fifth}"
check "non-semver app version fails" "$([ "$status" -ne 0 ] && grep -qF 'is not x.y.z' "${errors}" && echo yes || echo no)"

run_release v0.0.5 "${fourth}" main
check "ancestor of main that is not the tip fails" "$([ "$status" -ne 0 ] && grep -qF 'tip' "${errors}" && echo yes || echo no)"

run_release v0.0.6 "${fifth}" main
check "tip of main with a bad version still fails on semver, not on tip" "$([ "$status" -ne 0 ] && ! grep -qF 'tip' "${errors}" && echo yes || echo no)"

run_release v0.0.5 "${fourth}" missing-ref
check "missing main ref fails closed" "$([ "$status" -ne 0 ] && echo yes || echo no)"

git checkout -q -b side
echo 'z' >side.txt
side=$(commit "off main")
run_release v0.0.6 "${side}" main
check "tag off main fails (not the tip)" "$([ "$status" -ne 0 ] && grep -qF 'tip' "${errors}" && echo yes || echo no)"

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

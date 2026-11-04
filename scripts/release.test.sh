#!/usr/bin/env bash
# Tests for release.sh: changes (with and without a previous tag), bump levels and refusals, every tag refusal,
# tags only for bumped apps, and that nothing is pushed. Usage: bash scripts/release.test.sh
# Builds a throwaway repo with a local bare origin under $TMPDIR; a stub turbo (TURBO_BIN) derives its JSON from `git diff`.
set -euo pipefail

scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "${scripts_dir}")"
work="$(mktemp -d "${TMPDIR:-/tmp}/release-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
origin="${work}/origin.git"
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

git init -q --bare -b main "${origin}"
git init -q -b main "${repo}"
cd "${repo}"
git config user.email test@example.test
git config user.name test
git config commit.gpgsign false
git remote add origin "${origin}"
mkdir -p apps/cms-api apps/cms-admin apps/web apps/e2e .github/scripts scripts .github/workflows
cp "${repo_dir}/.github/scripts/affected.sh" "${repo_dir}/.github/scripts/release-apps.sh" .github/scripts/
cp "${scripts_dir}/release.sh" scripts/
echo '  TURBO_VERSION: 9.9.9' >.github/workflows/ci.yml

write_versions() { # root cms-api cms-admin web e2e: two-space JSON with extra fields, like the real files
  local file index=0 versions=("$@")
  for file in package.json apps/cms-api/package.json apps/cms-admin/package.json apps/web/package.json apps/e2e/package.json; do
    printf '{\n  "name": "x",\n  "version": "%s",\n  "private": true\n}\n' "${versions[$index]}" >"${file}"
    index=$((index + 1))
  done
}
commit() { git add -A && git commit -qm "$1" && git rev-parse HEAD; }

release() { # args: sets $status, $output (stdout), $errors (stderr); TURBO_BIN set
  status=0
  errors="$(mktemp -p "${work}")"
  output="$(TURBO_BIN="${stub}" bash scripts/release.sh "$@" 2>"${errors}")" || status=$?
}
check() { # name yes|no
  if [ "$2" = yes ]; then echo "PASS $1"; passed=$((passed + 1)); else echo "FAIL $1: exit ${status}, output: ${output}, stderr: $(cat "${errors}")"; failed=$((failed + 1)); fi
}
yes_if() { if "$@"; then echo yes; else echo no; fi; }
refused() { yes_if test "${status}" -ne 0 -a -z "${output}"; }
refused_with() { yes_if grep -qF "$1" "${errors}"; }
json() { jq -r "$1" <<<"${output}"; }

write_versions 0.0.1 0.0.1 0.0.1 0.0.1 0.0.1
echo '# Changelog' >CHANGELOG.md
first=$(commit "feat(cms-api): first")
echo a >apps/cms-api/a.ts && commit "feat(cms-api): add a" >/dev/null
echo w >apps/web/w.ts && commit "fix(web): fix w" >/dev/null
echo r >root.txt && commit "docs(root): root only" >/dev/null
git push -q origin main

# ---- changes without a previous tag
release changes
check "changes: no previous tag, first commit included" \
  "$(yes_if test "$(json '.previous_tag')" = "" -a "$(json '.apps["cms-api"].commits | length')" = 2 -a "$(json '.repo_version')" = 0.0.1)"
check "changes: every deployed app affected with an image" \
  "$(yes_if test "$(json '[.apps | to_entries[] | select(.key | IN("cms-api", "cms-admin", "web")) | .value | select(.is_affected and .is_image_affected)] | length')" = 3)"
check "changes: commit has sha and subject, repo commits apart" \
  "$(yes_if test "$(json '.apps.web.commits[0].subject')" = "fix(web): fix w" -a "$(json '.repo_commits[0].subject')" = "docs(root): root only")"

# ---- bump
git checkout -q -b develop
release bump --repo minor --app cms-api=patch --app web=major
check "bump: prints old and new" \
  "$(yes_if test "$(json '.repo.new')" = 0.1.0 -a "$(json '.apps["cms-api"].new')" = 0.0.2 -a "$(json '.apps.web.new')" = 1.0.0)"
check "bump: files written, others byte for byte" \
  "$(yes_if test "$(jq -r .version package.json)" = 0.1.0 -a "$(jq -r .version apps/web/package.json)" = 1.0.0 -a "$(git diff --name-only | sort | tr '\n' ' ')" = "apps/cms-api/package.json apps/web/package.json package.json ")"
check "bump: formatting kept (only the version line differs)" \
  "$(yes_if test "$(git diff --numstat -- package.json | cut -f1,2)" = "$(printf '1\t1')")"
git checkout -q -- .

release bump --repo patch --app nope=patch
check "bump: unknown app refused" "$(refused)"
release bump --repo patch --app web=huge
check "bump: unknown level refused" "$(refused)"
release bump --repo huge
check "bump: unknown repo level refused" "$(refused)"
echo dirt >dirt.txt
release bump --repo patch
check "bump: dirty tree refused" "$(refused_with 'not clean')"
rm dirt.txt
git checkout -q main
release bump --repo patch
check "bump: refused on main" "$(refused_with 'refused on main')"
git checkout -q develop

# ---- release commit on develop, merged into main
release bump --repo minor --app cms-api=patch --app web=major
printf '# Changelog\n\n## 0.1.0 - 2026-01-01\n' >CHANGELOG.md
release_commit=$(commit "chore(root): release 0.1.0")
git checkout -q main && git merge -q --ff-only develop

release bump --repo patch
check "bump: refused on main even for pending release" "$(refused)"
git checkout -q develop
release bump --repo patch
check "bump: allowed before the first tag exists" \
  "$(yes_if test "${status}" -eq 0)"
git checkout -q -- .

# ---- tag refusals
git checkout -q develop
release tag
check "tag: refused off main" "$(refused_with 'main only')"
git checkout -q main

release tag
check "tag: refused when HEAD is not origin/main" "$(refused_with 'is not origin/main')"
git push -q origin main

echo dirt >dirt.txt
release tag
check "tag: refused on a dirty tree" "$(refused_with 'not clean')"
rm dirt.txt

printf '# Changelog\n' >CHANGELOG.md && commit "docs(root): drop heading" >/dev/null && git push -q origin main
release tag
check "tag: refused without a CHANGELOG heading" "$(refused_with "no '## 0.1.0' heading")"
printf '# Changelog\n\n## 0.1.0 - 2026-01-01\n' >CHANGELOG.md && commit "docs(root): heading" >/dev/null && git push -q origin main

origin_refs_before="$(git --git-dir="${origin}" for-each-ref | sort)"

# ---- first release: every app tagged
release tag
check "tag: first release creates the repo tag and every app tag" \
  "$(yes_if test "${status}" -eq 0 && git rev-parse -q --verify refs/tags/v0.1.0 >/dev/null && git rev-parse -q --verify refs/tags/cms-api@0.0.2 >/dev/null \
     && git rev-parse -q --verify refs/tags/web@1.0.0 >/dev/null && git rev-parse -q --verify refs/tags/cms-admin@0.0.1 >/dev/null \
     && git rev-parse -q --verify refs/tags/e2e@0.0.1 >/dev/null)"
check "tag: tags are annotated" "$(yes_if test "$(git cat-file -t v0.1.0)" = tag -a "$(git cat-file -t web@1.0.0)" = tag)"
check "tag: prints both push commands" "$(yes_if grep -qF 'git push origin v0.1.0' <<<"${output}" && grep -qF 'git push origin cms-api@0.0.2' <<<"${output}")"
check "tag: nothing pushed" "$(yes_if test "$(git --git-dir="${origin}" for-each-ref | sort)" = "${origin_refs_before}")"

release tag
check "tag: refused when the tag exists" "$(refused_with 'already exists')"

# ---- second release: only bumped apps get tags; changes uses the previous tag
git push -q origin v0.1.0
git checkout -q develop && git merge -q --ff-only main
echo c >apps/cms-admin/c.ts && commit "feat(cms-admin): add c" >/dev/null
release changes
check "changes: with a previous tag only newer commits" \
  "$(yes_if test "$(json '.previous_tag')" = v0.1.0 -a "$(json '.apps["cms-admin"].commits | length')" = 1 -a "$(json '.apps["cms-api"].commits | length')" = 0 \
     -a "$(json '.apps["cms-admin"].is_image_affected')" = true -a "$(json '.apps["cms-api"].is_affected')" = false)"
release bump --repo patch --app cms-admin=minor
printf '# Changelog\n\n## 0.1.1 - 2026-02-01\n\n## 0.1.0 - 2026-01-01\n' >CHANGELOG.md
commit "chore(root): release 0.1.1" >/dev/null
release bump --repo patch
check "bump: unfinished release (newer version, no tag) refused" "$(refused_with 'unfinished release')"
git checkout -q main && git merge -q --ff-only develop && git push -q origin main
release tag
check "tag: second release tags the repo and only the bumped app" \
  "$(yes_if test "${status}" -eq 0 && git rev-parse -q --verify refs/tags/v0.1.1 >/dev/null && git rev-parse -q --verify refs/tags/cms-admin@0.1.0 >/dev/null \
     && ! git rev-parse -q --verify refs/tags/cms-api@0.0.2 >/dev/null && ! git rev-parse -q --verify refs/tags/web@1.0.1 >/dev/null \
     && ! git tag -l | grep -qx 'e2e@0.0.2')"

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

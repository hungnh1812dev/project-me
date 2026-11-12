#!/usr/bin/env bash
# Tests for local-registry-push.sh with stub docker and curl. Usage: bash scripts/local-registry-push.test.sh
# Runs a copy of the script inside a throwaway git repo under $TMPDIR; the stubs record their arguments, one per line.
set -uo pipefail

scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "${scripts_dir}")"
work="$(mktemp -d "${TMPDIR:-/tmp}/local-registry-push-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
repo="${work}/repo"
stubs="${work}/stubs"
docker_log="${work}/docker.log"
curl_log="${work}/curl.log"
out="${work}/out"
secret_value='secret-marker-value'
passed=0
failed=0

mkdir -p "${stubs}" "${repo}/scripts" "${repo}/.github/scripts"
cat >"${stubs}/docker" <<'STUB'
#!/usr/bin/env bash
{ echo "CALL $1"; shift; for a in "$@"; do echo "ARG $a"; done; } >>"${DOCKER_LOG}"
if [ "${STUB_DOCKER_FAIL:-}" = "$(grep -c '^CALL' "${DOCKER_LOG}")" ]; then exit 1; fi
STUB
cat >"${stubs}/curl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"${CURL_LOG}"
if [ -n "${STUB_CURL_FAIL:-}" ]; then exit 22; fi
STUB
chmod +x "${stubs}/docker" "${stubs}/curl"

cp "${scripts_dir}/local-registry-push.sh" "${repo}/scripts/"
cp "${repo_dir}/.github/scripts/build-args.sh" "${repo}/.github/scripts/"
cd "${repo}"
git init -q -b main
git add -A
git -c user.name=test -c user.email=test@example.test -c commit.gpgsign=false commit -q -m init
head_hash="$(git rev-parse --short HEAD)"

# run <env assignments...> -- <args...>: sets status; the stdout and stderr go to ${out}
run() {
  local envs=()
  while [ "$1" != -- ]; do envs+=("$1"); shift; done
  shift
  : >"${docker_log}"
  : >"${curl_log}"
  status=0
  env -i PATH="${stubs}:${PATH}" HOME="${work}" DOCKER_LOG="${docker_log}" CURL_LOG="${curl_log}" ${envs[@]+"${envs[@]}"} \
    bash scripts/local-registry-push.sh "$@" >"${out}" 2>&1 || status=$?
}

check() { # description condition-exit-code
  if [ "$2" -eq 0 ]; then passed=$((passed + 1)); else failed=$((failed + 1)); echo "FAIL: $1"; fi
}
has_line() { grep -qxF -- "$1" "$2"; }
count_calls() { grep -c "^CALL $1" "${docker_log}" || true; }

full_env=(TURBO_VERSION=9.9.9 VITE_API_BASE_URL=http://localhost:8080/api/v1 NEXT_PUBLIC_ADMIN_URL=http://localhost:8080
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=site-key)

run "${full_env[@]}" LOCAL_IMAGE_TAG=t1 --
check "all apps exit 0" "${status}"
has_line "ARG k3d-registry.localhost:5001/cms-api:t1" "${docker_log}"; check "cms-api ref" $?
has_line "ARG k3d-registry.localhost:5001/cms-admin:t1" "${docker_log}"; check "cms-admin ref" $?
has_line "ARG k3d-registry.localhost:5001/web:t1" "${docker_log}"; check "web ref" $?
[ "$(count_calls build)" = 3 ] && [ "$(count_calls push)" = 3 ]; check "three builds and pushes" $?
[ "$(grep -c '^ARG --build-arg$' "${docker_log}")" = 6 ]; check "six build args in total" $?
has_line "ARG VITE_API_BASE_URL=http://localhost:8080/api/v1" "${docker_log}"; check "admin build arg" $?
has_line "ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=site-key" "${docker_log}"; check "site key build arg" $?
[ "$(grep -n 'cms-api:t1' "${out}" | cut -d: -f1 | head -1)" = 1 ]; check "refs printed in order" $?
grep -q 'localhost:5001/v2/' "${curl_log}"; check "registry probed" $?

run TURBO_VERSION= NEXT_PUBLIC_ADMIN_URL= NEXT_PUBLIC_TURNSTILE_SITE_KEY=k LOCAL_IMAGE_TAG=t1 -- web
check "empty values exit 0" "${status}"
[ "$(grep -c '^ARG --build-arg$' "${docker_log}")" = 1 ]; check "empty TURBO_VERSION and ADMIN_URL skipped" $?

run TURBO_VERSION=9.9.9 LOCAL_IMAGE_TAG=t1 -- cms-api
[ "$(count_calls build)" = 1 ] && ! grep -q 'cms-admin\|web:' "${docker_log}"; check "one app builds only that app" $?
has_line "ARG TURBO_VERSION=9.9.9" "${docker_log}"; check "TURBO_VERSION passed" $?

run VITE_API_BASE_URL='a b' LOCAL_IMAGE_TAG=t1 -- cms-admin
has_line "ARG VITE_API_BASE_URL=a b" "${docker_log}"; check "value with a space is one argument" $?

run LOCAL_REGISTRY=reg.test:9 LOCAL_IMAGE_TAG=custom TURBO_VERSION=1 -- cms-api
has_line "ARG reg.test:9/cms-api:custom" "${docker_log}"; check "registry and tag overrides" $?
grep -q 'reg.test:9/v2/' "${curl_log}"; check "overridden registry probed" $?

run TURBO_VERSION=1 -- cms-api
has_line "ARG k3d-registry.localhost:5001/cms-api:${head_hash}" "${docker_log}"; check "default tag is the short head hash" $?
touch dirty-file
run TURBO_VERSION=1 -- cms-api
has_line "ARG k3d-registry.localhost:5001/cms-api:${head_hash}-dirty" "${docker_log}"; check "dirty tree adds -dirty" $?
rm dirty-file

expect_refusal() { # description
  [ "${status}" -ne 0 ] && [ ! -s "${docker_log}" ] && ! grep -q "${secret_value}" "${out}"
  check "$1" $?
}
run -- nope
expect_refusal "unknown app"; grep -q '^unknown app' "${out}"; check "unknown app prints usage" $?
run "${full_env[@]}" -- cms-admin nope
expect_refusal "unknown app after a valid one"
run NEXT_PUBLIC_TURNSTILE_SITE_KEY=x -- cms-admin
expect_refusal "missing VITE_API_BASE_URL"
run NEXT_PUBLIC_ADMIN_URL="${secret_value}" -- web
expect_refusal "missing site key"; grep -q 'NEXT_PUBLIC_TURNSTILE_SITE_KEY' "${out}"; check "site key refusal names the key" $?
run "${full_env[@]}" STUB_CURL_FAIL=1 -- 
expect_refusal "unreachable registry"; grep -q 'docs/deployments/local-registry.md' "${out}"; check "registry refusal points to the doc" $?

run "${full_env[@]}" LOCAL_IMAGE_TAG=t1 STUB_DOCKER_FAIL=1 --
[ "${status}" -ne 0 ] && [ "$(count_calls build)" = 1 ] && [ "$(count_calls push)" = 0 ]; check "failed build stops before push and next app" $?
run "${full_env[@]}" LOCAL_IMAGE_TAG=t1 STUB_DOCKER_FAIL=2 --
[ "${status}" -ne 0 ] && [ "$(count_calls push)" = 1 ] && [ "$(count_calls build)" = 1 ]; check "failed push stops the run" $?

echo "passed: ${passed}, failed: ${failed}"
[ "${failed}" -eq 0 ]

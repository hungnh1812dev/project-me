#!/usr/bin/env bash
# Tests for nightly-backup.sh with stub pg_dump, psql, age, rclone and date. Usage: bash apps/cms-api/backup/nightly-backup.test.sh
# Runs under bash because the CI runner's sh may lack pipefail; the image's busybox sh is proven by the image guard.
set -uo pipefail

backup_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${backup_dir}/../../.." && pwd)"
constants_file="${repo_dir}/apps/cms-api/src/modules/backups/domain/Backups.constants.ts"
work="$(mktemp -d "${TMPDIR:-/tmp}/nightly-backup-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
stubs="${work}/stubs"
log="${work}/calls.log"
out="${work}/out"
passed=0
failed=0

mkdir -p "${stubs}"
for tool in pg_dump psql age rclone; do
  cat >"${stubs}/${tool}" <<'STUB'
#!/usr/bin/env bash
tool="$(basename "$0")"
{ echo "CALL ${tool}"; for a in "$@"; do echo "ARG ${a}"; done; } >>"${CALLS_LOG}"
case "${tool}" in
  pg_dump) if [ -n "${STUB_PG_DUMP_FAIL:-}" ]; then exit 3; fi; head -c "${STUB_DUMP_BYTES:-500}" /dev/zero | tr '\0' x ;;
  psql) echo "${STUB_DATABASE_BYTES:-1000}" ;;
  age) cat ;;
  rclone)
    case "$1" in
      rcat) cat >/dev/null ;;
      size) echo "{\"count\":1,\"bytes\":${STUB_DUMP_BYTES:-500}}" ;;
    esac ;;
esac
STUB
done
cat >"${stubs}/date" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "-u +%d") echo "${STUB_DAY:-16}" ;;
  *) echo 20261116T021500Z ;;
esac
STUB
chmod +x "${stubs}"/*

# The pattern is read from the constants file so the test holds no copy of it.
pattern="$(sed -n '/BACKUP_FILE_NAME_PATTERN =/{n;s|^ */\(.*\)/;$|\1|;p;}' "${constants_file}" | sed 's/\\d/[0-9]/g')"

full_env=(NODE_ENV=production DB_HOST=db.test DB_PORT=5432 DB_NAME=abyss DB_USERNAME=abyss_backup DB_PASSWORD=pw-marker-91
  BACKUP_BUCKET=bucket-marker BACKUP_PREFIX=pre/ BACKUP_AGE_RECIPIENT=age1recipientmarker
  BACKUP_MAX_DATABASE_BYTES=2000 BACKUP_MAX_DUMP_BYTES=1000)
dump_only_env=()
for kv in "${full_env[@]}"; do
  case "${kv%%=*}" in NODE_ENV | BACKUP_BUCKET | BACKUP_PREFIX) ;; *) dump_only_env+=("${kv}") ;; esac
done

# run <env assignments...>: sets status; stdout and stderr go to ${out}, the stub calls to ${log}
run() {
  : >"${log}"
  status=0
  env -i PATH="${stubs}:${PATH}" HOME="${work}" CALLS_LOG="${log}" "$@" sh -c 'exec bash "$0"' "${backup_dir}/nightly-backup.sh" >"${out}" 2>&1 || status=$?
}
check() { # description condition-exit-code
  if [ "$2" -eq 0 ]; then passed=$((passed + 1)); else failed=$((failed + 1)); echo "FAIL: $1"; fi
}
calls() { grep -c "^CALL $1" "${log}" || true; }
has_arg() { grep -qxF -- "ARG $1" "${log}"; }
without() { # env without one key
  local skip="$1" kv
  for kv in "${full_env[@]}"; do [ "${kv%%=*}" = "${skip}" ] || printf '%s\n' "${kv}"; done
}

check "the file name pattern was read from the constants" "$([ -n "${pattern}" ] && echo 0 || echo 1)"

run "${full_env[@]}"
check "happy path exits 0" "$([ "${status}" -eq 0 ] && echo 0 || echo 1)"
check "production run logs mode: upload" "$(grep -qx 'mode: upload' "${out}" && echo 0 || echo 1)"
check "one rcat upload" "$([ "$(calls rclone)" -eq 2 ] && grep -qx 'ARG rcat' "${log}" && echo 0 || echo 1)"
daily_key="$(grep -m1 '^ARG offsite:' "${log}" | sed 's/^ARG //')"
check "daily key is in the bucket and prefix" "$([[ "${daily_key}" == offsite:bucket-marker/pre/daily/abyss-* ]] && echo 0 || echo 1)"
check "built name matches the pattern" "$(basename "${daily_key}" | grep -Eq "${pattern}" && echo 0 || echo 1)"
check "content type header" "$(has_arg 'Content-Type: application/octet-stream' && echo 0 || echo 1)"
check "content disposition header" "$(has_arg "Content-Disposition: attachment; filename=\"$(basename "${daily_key}")\"" && echo 0 || echo 1)"
check "no monthly copy on day 16" "$([ "$(grep -c '^ARG copyto' "${log}" || true)" -eq 0 ] && echo 0 || echo 1)"
check "age gets the recipient" "$(has_arg age1recipientmarker && echo 0 || echo 1)"
check "pg_dump limited to the two schemas" "$(has_arg public && has_arg content && has_arg -Fc && echo 0 || echo 1)"
check "no stub receives the password" "$(grep -q 'pw-marker-91' "${log}" && echo 1 || echo 0)"
check "the password is not printed" "$(grep -q 'pw-marker-91' "${out}" && echo 1 || echo 0)"

run "${full_env[@]}" STUB_DAY=01
copies="$(grep -c '^ARG copyto' "${log}" || true)"
check "day 01 exits 0" "$([ "${status}" -eq 0 ] && echo 0 || echo 1)"
check "day 01 adds exactly one copyto" "$([ "${copies}" -eq 1 ] && echo 0 || echo 1)"
check "monthly key" "$(grep -q '^ARG offsite:bucket-marker/pre/monthly/abyss-' "${log}" && echo 0 || echo 1)"

run "${full_env[@]}" STUB_PG_DUMP_FAIL=1 STUB_DAY=01
check "failing pg_dump exits non-zero" "$([ "${status}" -ne 0 ] && echo 0 || echo 1)"
check "failing pg_dump skips size check and monthly copy" "$(grep -qE '^ARG (size|copyto)$' "${log}" && echo 1 || echo 0)"

run "${full_env[@]}" STUB_DATABASE_BYTES=5000
check "database over limit exits 1" "$([ "${status}" -eq 1 ] && echo 0 || echo 1)"
check "database over limit warns" "$(grep -q '^WARN' "${out}" && echo 0 || echo 1)"
check "database over limit still uploads" "$(grep -qx 'ARG rcat' "${log}" && echo 0 || echo 1)"

run "${full_env[@]}" STUB_DUMP_BYTES=5000 STUB_DAY=01
check "dump over limit exits 1" "$([ "${status}" -eq 1 ] && echo 0 || echo 1)"
check "dump over limit warns" "$(grep -q '^WARN' "${out}" && echo 0 || echo 1)"
check "dump over limit keeps the dump and copies monthly" "$(grep -qx 'ARG copyto' "${log}" && echo 0 || echo 1)"

check_missing_key() { # key, then the env it is removed from
  local key="$1" kv partial=() leaked=0
  shift
  for kv in "$@"; do [ "${kv%%=*}" = "${key}" ] || partial+=("${kv}"); done
  run "${partial[@]}"
  check "missing ${key} exits 2" "$([ "${status}" -eq 2 ] && echo 0 || echo 1)"
  check "missing ${key} is named" "$(grep -q "${key}" "${out}" && echo 0 || echo 1)"
  check "missing ${key} runs no tool" "$([ ! -s "${log}" ] && echo 0 || echo 1)"
  for kv in "${partial[@]}"; do
    ! grep -qF -- "${kv#*=}" "${out}" || leaked=1
  done
  check "missing ${key} prints no value of the other keys" "${leaked}"
}

for key in DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD BACKUP_BUCKET BACKUP_PREFIX BACKUP_AGE_RECIPIENT BACKUP_MAX_DATABASE_BYTES BACKUP_MAX_DUMP_BYTES; do
  check_missing_key "${key}" "${full_env[@]}"
done

# Dump-only run: NODE_ENV unset, no bucket, no prefix.
for key in DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD BACKUP_AGE_RECIPIENT BACKUP_MAX_DATABASE_BYTES BACKUP_MAX_DUMP_BYTES; do
  check_missing_key "${key}" "${dump_only_env[@]}"
done

run "${dump_only_env[@]}" STUB_DAY=01
check "dump-only exits 0" "$([ "${status}" -eq 0 ] && echo 0 || echo 1)"
check "dump-only calls no rclone, also on day 01" "$([ "$(calls rclone)" -eq 0 ] && echo 0 || echo 1)"
check "dump-only logs mode: dump-only" "$(grep -qx 'mode: dump-only' "${out}" && echo 0 || echo 1)"
check "dump-only shows the byte count of the stub" "$(grep -qx 'dump size: 500 bytes' "${out}" && echo 0 || echo 1)"
check "dump-only pg_dump limited to the two schemas" "$(has_arg public && has_arg content && has_arg -Fc && echo 0 || echo 1)"
check "dump-only age gets the recipient" "$(has_arg age1recipientmarker && echo 0 || echo 1)"
check "dump-only writes no file" "$([ "$(ls "${work}" | tr '\n' ' ')" = "calls.log out stubs " ] && echo 0 || echo 1)"

run "${dump_only_env[@]}" STUB_DATABASE_BYTES=5000
check "dump-only database over limit exits 1" "$([ "${status}" -eq 1 ] && echo 0 || echo 1)"
check "dump-only database over limit warns and still dumps" "$(grep -q '^WARN' "${out}" && grep -qx 'CALL pg_dump' "${log}" && echo 0 || echo 1)"

run "${dump_only_env[@]}" STUB_DUMP_BYTES=5000
check "dump-only dump over limit exits 1" "$([ "${status}" -eq 1 ] && echo 0 || echo 1)"
check "dump-only dump over limit warns" "$(grep -q '^WARN' "${out}" && grep -qx 'dump size: 5000 bytes' "${out}" && echo 0 || echo 1)"

run "${dump_only_env[@]}" STUB_PG_DUMP_FAIL=1
check "dump-only failing pg_dump exits non-zero" "$([ "${status}" -ne 0 ] && echo 0 || echo 1)"

for value in staging Production; do
  run "${dump_only_env[@]}" NODE_ENV="${value}" STUB_DAY=01
  check "NODE_ENV=${value} is a dump-only run" "$([ "${status}" -eq 0 ] && [ "$(calls rclone)" -eq 0 ] && grep -qx 'mode: dump-only' "${out}" && echo 0 || echo 1)"
done

run "${dump_only_env[@]}" NODE_ENV=env-marker-77
check "NODE_ENV value is never printed" "$(grep -q 'env-marker-77' "${out}" && echo 1 || echo 0)"
run "${full_env[@]}" NODE_ENV=production
check "NODE_ENV=production value is not echoed as a key value" "$(grep -q 'NODE_ENV' "${out}" && echo 1 || echo 0)"

echo "nightly-backup tests: ${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]

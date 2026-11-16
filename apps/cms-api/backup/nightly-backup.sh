#!/bin/sh
# Nightly backup job (BK-6, ADR 0025 point 7): pg_dump | age, with no temporary file. Two runs, chosen by NODE_ENV:
#   upload (NODE_ENV=production exactly): ... | rclone rcat to the bucket, size of the object by rclone, monthly copy.
#   dump-only (any other value or none): the encrypted dump is only counted with wc -c; no rclone call, nothing stored.
# Runs under busybox sh in the cms-api image; the job's Secret and ConfigMap supply every key below.
# Exit codes: 0 done, 1 a size limit was exceeded (the dump is kept), 2 a key is missing, other: a tool failed.
set -eu -o pipefail

PRODUCTION_ENV=production
REQUIRED_KEYS="DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD BACKUP_AGE_RECIPIENT BACKUP_MAX_DATABASE_BYTES BACKUP_MAX_DUMP_BYTES"
UPLOAD_KEYS="BACKUP_BUCKET BACKUP_PREFIX"
EXIT_MISSING_KEY=2
MONTHLY_COPY_DAY=01

is_production() {
  [ "${NODE_ENV-}" = "$PRODUCTION_ENV" ]
}

require_env() {
  missing=""
  keys="$REQUIRED_KEYS"
  if is_production; then keys="$keys $UPLOAD_KEYS"; fi
  for key in $keys; do
    eval "value=\${$key-}"
    if [ -z "$value" ]; then missing="$missing $key"; fi
  done
  if [ -n "$missing" ]; then
    echo "ERROR missing keys:$missing" >&2
    exit "$EXIT_MISSING_KEY"
  fi
}

# Logs the database size; a size over the limit sets status=1.
check_database_size() {
  size="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -Atc 'select pg_database_size(current_database())')"
  echo "database size: ${size} bytes"
  if [ "$size" -gt "$BACKUP_MAX_DATABASE_BYTES" ]; then
    echo "WARN database over limit"
    status=1
  fi
}

upload_dump() {
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -Fc -n public -n content \
    | age -r "$BACKUP_AGE_RECIPIENT" \
    | rclone rcat \
      --header-upload "Content-Type: application/octet-stream" \
      --header-upload "Content-Disposition: attachment; filename=\"${name}\"" \
      "$daily"
  echo "uploaded: ${daily}"
}

count_uploaded_bytes() {
  rclone size --json "$daily" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p'
}

# pipefail makes a failed pg_dump or age fail the command substitution, so the run fails.
count_dump_bytes() {
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -Fc -n public -n content \
    | age -r "$BACKUP_AGE_RECIPIENT" \
    | wc -c \
    | tr -dc '0-9'
}

# Logs the dump size given in bytes; a size over the limit sets status=1.
check_dump_size() {
  dump="$1"
  echo "dump size: ${dump} bytes"
  if [ "$dump" -gt "$BACKUP_MAX_DUMP_BYTES" ]; then
    echo "WARN dump over limit"
    status=1
  fi
}

# Server-side copy: the bytes never pass through the cluster.
copy_monthly() {
  if [ "$(date -u +%d)" = "$MONTHLY_COPY_DAY" ]; then
    rclone copyto "$daily" "offsite:${BACKUP_BUCKET}/${BACKUP_PREFIX}monthly/${name}"
  fi
}

require_env
if is_production; then echo "mode: upload"; else echo "mode: dump-only"; fi
PGPASSWORD="$DB_PASSWORD"
export PGPASSWORD
status=0

if is_production; then
  name="abyss-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
  daily="offsite:${BACKUP_BUCKET}/${BACKUP_PREFIX}daily/${name}"
  check_database_size
  upload_dump
  check_dump_size "$(count_uploaded_bytes)"
  copy_monthly
else
  check_database_size
  dump_bytes="$(count_dump_bytes)"
  check_dump_size "$dump_bytes"
fi
exit "$status"

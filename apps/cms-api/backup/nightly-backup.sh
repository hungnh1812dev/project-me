#!/bin/sh
# Nightly backup job (BK-6, ADR 0025): pg_dump | age | rclone rcat, with no temporary file.
# Runs under busybox sh in the cms-api image; the job's Secret and ConfigMap supply every key below.
# Exit codes: 0 done, 1 a size limit was exceeded (the dump is kept), 2 a key is missing, other: a tool failed.
set -eu -o pipefail

REQUIRED_KEYS="DB_HOST DB_PORT DB_NAME DB_USERNAME DB_PASSWORD BACKUP_BUCKET BACKUP_PREFIX BACKUP_AGE_RECIPIENT BACKUP_MAX_DATABASE_BYTES BACKUP_MAX_DUMP_BYTES"
EXIT_MISSING_KEY=2
MONTHLY_COPY_DAY=01

require_env() {
  missing=""
  for key in $REQUIRED_KEYS; do
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

check_dump_size() {
  dump="$(rclone size --json "$daily" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
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
PGPASSWORD="$DB_PASSWORD"
export PGPASSWORD
name="abyss-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
daily="offsite:${BACKUP_BUCKET}/${BACKUP_PREFIX}daily/${name}"
status=0

check_database_size
upload_dump
check_dump_size
copy_monthly
exit "$status"

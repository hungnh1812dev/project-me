#!/usr/bin/env bash
# Creates the database roles of ADR 0012 on the smoke stack's db service.
# Runs twice: by the postgres image on the first start (/docker-entrypoint-initdb.d,
# before any table exists), and by scripts/smoke.sh after cms-api-init exited 0
# (the meta tables now exist). Passwords come from the container environment and
# are never printed or put on a command line.
set -euo pipefail

SCRIPT_FILE="/opt/abyss/db/database-roles.sql"
MIGRATOR_ROLE="abyss_migrator"
API_ROLE="abyss_api"
BACKUP_ROLE="abyss_backup"

psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v hosting=self_managed -v migrator_role="$MIGRATOR_ROLE" \
  -v api_role="$API_ROLE" -v backup_role="$BACKUP_ROLE" -f "$SCRIPT_FILE"

psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v migrator_role="$MIGRATOR_ROLE" -v api_role="$API_ROLE" >/dev/null <<'SQL'
\getenv migrator_password SMOKE_DB_MIGRATOR_PASSWORD
\getenv api_password SMOKE_DB_API_PASSWORD
ALTER ROLE :"migrator_role" PASSWORD :'migrator_password';
ALTER ROLE :"api_role" PASSWORD :'api_password';
SQL

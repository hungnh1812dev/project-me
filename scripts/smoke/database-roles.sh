# Smoke section: the database roles of ADR 0012. Sourced by scripts/smoke.sh
# (pass, fail, compose) after the init container check: the meta tables exist now.

ROLES_HOOK_FILE="/docker-entrypoint-initdb.d/database-roles.sh"
API_ROLE="abyss_api"
API_PASSWORD_ENV="SMOKE_DB_API_PASSWORD"
DB_LOOPBACK="127.0.0.1"
APP_TABLE="public.accounts"
META_TABLE="content._content_types"
REFUSAL_PATTERN="permission denied|must be owner"
DDL_SMOKE_NAME="smoke_ddl_probe"

# Statements the API role must be refused: "<label>|<sql>".
API_REFUSED_STATEMENTS=(
  "CREATE TABLE in public|CREATE TABLE public.$DDL_SMOKE_NAME (id int)"
  "CREATE TABLE in content|CREATE TABLE content.$DDL_SMOKE_NAME (id int)"
  "CREATE SCHEMA|CREATE SCHEMA $DDL_SMOKE_NAME"
  "ALTER TABLE|ALTER TABLE $APP_TABLE ADD COLUMN $DDL_SMOKE_NAME int"
  "DROP TABLE|DROP TABLE $APP_TABLE"
  "TRUNCATE|TRUNCATE $APP_TABLE"
  "CREATE TEMP TABLE|CREATE TEMP TABLE $DDL_SMOKE_NAME (id int)"
  "INSERT into $META_TABLE|INSERT INTO $META_TABLE DEFAULT VALUES"
)

# api_role_sql <sql>: runs one statement as the API role over TCP inside db.
# The password reaches psql through the container environment, not the command line.
api_role_sql() {
  local password="${!API_PASSWORD_ENV}"
  PGPASSWORD="$password" compose exec -T -e PGPASSWORD "$DB_SERVICE" \
    psql -h "$DB_LOOPBACK" -U "$API_ROLE" -d abyss -v ON_ERROR_STOP=1 -c "$1" 2>&1
}

check_database_roles() {
  echo "Database roles (ADR 0012)"
  local statement label sql output
  if compose exec -T "$DB_SERVICE" "$ROLES_HOOK_FILE" >/dev/null 2>&1; then
    pass "roles script runs again after the migrations (exit 0)"
  else
    fail "roles script failed when run again after the migrations"
  fi
  if output="$(api_role_sql "SELECT count(*) FROM $APP_TABLE")"; then
    pass "$API_ROLE can SELECT from $APP_TABLE"
  else
    fail "$API_ROLE cannot SELECT from $APP_TABLE: $output"
  fi
  for statement in "${API_REFUSED_STATEMENTS[@]}"; do
    label="${statement%%|*}"
    sql="${statement#*|}"
    if output="$(api_role_sql "$sql")"; then
      fail "$API_ROLE was allowed: $label"
    elif [[ "$output" =~ $REFUSAL_PATTERN ]]; then
      pass "$API_ROLE is refused: $label"
    else
      fail "$API_ROLE: $label failed for another reason: $output"
    fi
  done
}

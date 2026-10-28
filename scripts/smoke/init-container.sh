# Smoke section: the cms-api-init container (deploy:migrate). Sourced by scripts/smoke.sh.

INIT_SERVICE="cms-api-init"
INIT_EXIT_CODE_FORMAT='{{.State.ExitCode}}'

check_init_container() {
  echo "Init container ($INIT_SERVICE: deploy:migrate)"
  local init_container init_exit init_log fragment
  init_container="$(compose ps --all --quiet "$INIT_SERVICE")"
  init_exit="$(docker inspect --format "$INIT_EXIT_CODE_FORMAT" "$init_container" 2>/dev/null || echo "missing")"
  if [[ "$init_exit" == "0" ]]; then pass "$INIT_SERVICE exited 0"; else fail "$INIT_SERVICE exit code: $init_exit"; fi
  init_log="$(compose logs --no-color "$INIT_SERVICE" 2>&1 || true)"
  for fragment in "$DB_MIGRATE_APPLIED" "$DB_MIGRATE_SEEDED" "$CONTENT_MIGRATE_APPLIED"; do
    if [[ "$init_log" == *"$fragment"* ]]; then pass "$INIT_SERVICE log has '$fragment'"; else fail "$INIT_SERVICE log lacks '$fragment': $init_log"; fi
  done
}

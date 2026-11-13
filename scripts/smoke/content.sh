# Smoke section: publishes the site-shell and CV content the staging web renders (no mock fallback
# on a staging web). Sourced by scripts/smoke.sh; runs after the owner exists, before the web
# container is recreated, so web starts against published content.

CONTENT_DOCUMENTS_PATH="/documents"
CONTENT_PUBLISH_SEGMENT="publish"
CONTENT_TOKEN_FIELD="accessToken"
CONTENT_FIELD_READER='let body = ""; process.stdin.on("data", (chunk) => (body += chunk)).on("end", () => process.stdout.write(String(JSON.parse(body)[process.argv[1]] ?? "")))'

# content_send <path> <body file>: POST as the owner; the Bearer header goes through a mode 600 file, never the argument list.
content_send() {
  request POST "$ADMIN_ORIGIN$API_PREFIX$1" -H @"$WORK_DIR/content-auth" \
    -H 'Content-Type: application/json' --data-binary "$2"
}

check_seed_content() {
  echo "Published site-shell and CV content"
  local content_dir="$WORK_DIR/content" slug file document_id version login_body
  if ! node "$ROOT_DIR/scripts/smoke/SeedContent.mjs" "$content_dir"; then
    fail "content bodies built from the web mocks"
    return
  fi
  login_body="$(printf '{"email":"%s","password":"%s"}' "$STACK_OWNER_EMAIL" "$STACK_OWNER_PASSWORD")"
  printf '%s' "$login_body" >"$WORK_DIR/content-login"
  request POST "$ADMIN_ORIGIN$API_PREFIX/auth/login" -H 'Content-Type: application/json' \
    --data-binary @"$WORK_DIR/content-login"
  rm -f "$WORK_DIR/content-login"
  if [[ "$STATUS" != 2* ]]; then fail "content seed: owner sign-in (HTTP $STATUS)"; return; fi
  (umask 077 && printf 'Authorization: Bearer %s\n' \
    "$(node -e "$CONTENT_FIELD_READER" "$CONTENT_TOKEN_FIELD" <"$BODY")" >"$WORK_DIR/content-auth")
  for file in "$content_dir"/*.json; do
    slug="$(basename "$file" .json)"
    content_send "$CONTENT_DOCUMENTS_PATH/$slug" "@$file"
    if [[ "$STATUS" != 2* ]]; then fail "content seed: create $slug (HTTP $STATUS)"; continue; fi
    document_id="$(node -e "$CONTENT_FIELD_READER" documentId <"$BODY")"
    version="$(node -e "$CONTENT_FIELD_READER" version <"$BODY")"
    printf '{"expectedVersion":%s}' "$version" >"$WORK_DIR/content-publish"
    content_send "$CONTENT_DOCUMENTS_PATH/$slug/$document_id/$CONTENT_PUBLISH_SEGMENT" "@$WORK_DIR/content-publish"
    expect_status "content seed: $slug created and published" 200
  done
  rm -f "$WORK_DIR/content-auth"
}

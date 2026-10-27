#!/usr/bin/env bash
# Used by scripts/dev-stack.sh `demo`: turns reviewer access on and loads the
# sample content in a running dev stack. Source it; do not run it.
#
# The caller sets API_PORT, LOOPBACK, API_PREFIX and STACK_OWNER_EMAIL /
# STACK_OWNER_PASSWORD (stack_generate_credentials). The access token stays in
# DEMO_OWNER_TOKEN (a shell variable); it is never written to a file or printed.

DEMO_LOGIN_PATH="/auth/login"
DEMO_REVIEWER_SETTINGS_PATH="/reviewer/settings"
DEMO_HTTP_STATUS_FORMAT='%{http_code}'
DEMO_TOKEN_FIELD="accessToken"
DEMO_REQUEST_TIMEOUT_SECONDS=30
DEMO_DOCUMENTS_PATH="/documents"
DEMO_PUBLISH_SEGMENT="publish"
DEMO_CONTENT_DIR="$ROOT_DIR/scripts/demo/content"
DEMO_CONTENT_EXTENSION=".json"

demo_api_url() { echo "http://$LOOPBACK:$API_PORT$API_PREFIX$1"; }

# demo_sign_in_owner: POST /auth/login as the stack owner. The body goes through
# stdin so the password never shows in a process list.
demo_sign_in_owner() {
  local login_json response status
  login_json="$(DEMO_EMAIL="$STACK_OWNER_EMAIL" DEMO_PASSWORD="$STACK_OWNER_PASSWORD" node -e \
    'process.stdout.write(JSON.stringify({ email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }))')"
  response="$(printf '%s' "$login_json" | curl -sS --max-time "$DEMO_REQUEST_TIMEOUT_SECONDS" \
    -w "\n$DEMO_HTTP_STATUS_FORMAT" -X POST -H 'Content-Type: application/json' \
    --data-binary @- "$(demo_api_url "$DEMO_LOGIN_PATH")")"
  status="${response##*$'\n'}"
  if [[ "$status" != 2* ]]; then
    echo "Demo setup: owner sign-in failed (HTTP $status)." >&2
    return 1
  fi
  DEMO_OWNER_TOKEN="$(printf '%s' "${response%$'\n'*}" | DEMO_TOKEN_FIELD="$DEMO_TOKEN_FIELD" node -e \
    'let body = ""; process.stdin.on("data", (chunk) => (body += chunk)).on("end", () => process.stdout.write(String(JSON.parse(body)[process.env.DEMO_TOKEN_FIELD] ?? "")))')"
  [[ -n "$DEMO_OWNER_TOKEN" ]] || { echo "Demo setup: owner sign-in returned no access token." >&2; return 1; }
}

# demo_enable_reviewer: PUT /reviewer/settings { enabled: true }.
demo_enable_reviewer() {
  local status
  status="$(printf 'Authorization: Bearer %s\n' "$DEMO_OWNER_TOKEN" | curl -sS --max-time "$DEMO_REQUEST_TIMEOUT_SECONDS" \
    -o /dev/null -w "$DEMO_HTTP_STATUS_FORMAT" -X PUT \
    -H @- -H 'Content-Type: application/json' --data '{"enabled":true}' \
    "$(demo_api_url "$DEMO_REVIEWER_SETTINGS_PATH")")"
  if [[ "$status" != 2* ]]; then
    echo "Demo setup: enabling reviewer access failed (HTTP $status)." >&2
    return 1
  fi
}

# demo_post_json <path> <body>: POST as the owner. Sets DEMO_RESPONSE_BODY and
# DEMO_RESPONSE_STATUS; the body is only ever shown for these content calls.
demo_post_json() {
  local response
  response="$(printf 'Authorization: Bearer %s\n' "$DEMO_OWNER_TOKEN" | curl -sS --max-time "$DEMO_REQUEST_TIMEOUT_SECONDS" \
    -w "\n$DEMO_HTTP_STATUS_FORMAT" -X POST -H @- -H 'Content-Type: application/json' \
    --data-binary "$2" "$(demo_api_url "$1")")"
  DEMO_RESPONSE_STATUS="${response##*$'\n'}"
  DEMO_RESPONSE_BODY="${response%$'\n'*}"
}

# demo_json_field <json> <field>: prints one top-level field of a JSON text.
demo_json_field() {
  printf '%s' "$1" | DEMO_FIELD="$2" node -e \
    'let body = ""; process.stdin.on("data", (chunk) => (body += chunk)).on("end", () => process.stdout.write(String(JSON.parse(body)[process.env.DEMO_FIELD] ?? "")))'
}

# demo_seed_content: creates and publishes one document per file in
# scripts/demo/content/. The file name is the content type slug; the file is the
# create body. A new type needs only a new file.
demo_seed_content() {
  local file slug document_id version
  for file in "$DEMO_CONTENT_DIR"/*"$DEMO_CONTENT_EXTENSION"; do
    slug="$(basename "$file" "$DEMO_CONTENT_EXTENSION")"
    demo_post_json "$DEMO_DOCUMENTS_PATH/$slug" "$(cat "$file")"
    if [[ "$DEMO_RESPONSE_STATUS" != 2* ]]; then
      echo "Demo setup: creating '$slug' failed (HTTP $DEMO_RESPONSE_STATUS)." >&2
      return 1
    fi
    document_id="$(demo_json_field "$DEMO_RESPONSE_BODY" documentId)"
    version="$(demo_json_field "$DEMO_RESPONSE_BODY" version)"
    demo_post_json "$DEMO_DOCUMENTS_PATH/$slug/$document_id/$DEMO_PUBLISH_SEGMENT" "{\"expectedVersion\":$version}"
    if [[ "$DEMO_RESPONSE_STATUS" != 2* ]]; then
      echo "Demo setup: publishing '$slug' failed (HTTP $DEMO_RESPONSE_STATUS)." >&2
      return 1
    fi
  done
}

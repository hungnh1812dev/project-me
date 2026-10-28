# Smoke section: password reset mail through SMTP to Mailpit. Sourced by scripts/smoke.sh.

MAIL_POLL_ATTEMPTS="15"

check_mail() {
  echo "Password reset mail through SMTP to Mailpit"
  request POST "$WEB_ORIGIN$API_PREFIX/auth/password/request-otp" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s"}' "$STACK_OWNER_EMAIL")"
  expect_status "request-otp answers 202" 202
  request POST "$WEB_ORIGIN$API_PREFIX/auth/password/request-otp" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"nobody@%s"}' "$SMOKE_DOMAIN")"
  expect_status "request-otp answers 202 for an unknown email too" 202
  local mail_seen=0
  for _ in $(seq "$MAIL_POLL_ATTEMPTS"); do
    request GET "$MAILPIT_URL/api/v1/search?query=to:$STACK_OWNER_EMAIL"
    if [[ "$STATUS" == "200" ]] && grep -q "$RESET_MAIL_SUBJECT" "$BODY"; then mail_seen=1; break; fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
  if [[ "$mail_seen" == "1" ]]; then pass "the reset code reaches Mailpit over SMTP"; else fail "no reset mail in Mailpit"; fi
}

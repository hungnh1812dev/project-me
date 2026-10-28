# Smoke section: login, refresh and two-factor endpoints through the proxy.
# Sourced by scripts/smoke.sh.

check_auth() {
  echo "Auth through the proxy"
  login_body() { printf '{"email":"%s","password":"%s"}' "$STACK_OWNER_EMAIL" "$1"; }
  request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
    --data "$(login_body "$STACK_OWNER_PASSWORD")"
  expect_status "POST auth/login/ with trailing slash, right password (SPEC §12-17)" 200
  local refresh_cookie
  refresh_cookie="$(header Set-Cookie | sed -n "s/^\($REFRESH_COOKIE_NAME=[^;]*\);.*/\1/p")"
  if [[ -n "$refresh_cookie" ]]; then pass "login sets the refresh cookie"; else fail "login sets no refresh cookie"; fi
  request POST "$WEB_ORIGIN$API_PREFIX/auth/login/" -H 'Content-Type: application/json' \
    --data "$(login_body "wrong-$STACK_OWNER_PASSWORD")"
  expect_status "POST auth/login/ with trailing slash, wrong password (SPEC §12-17)" 401
  request POST "$WEB_ORIGIN$API_PREFIX/auth/refresh" -H "Cookie: $refresh_cookie"
  expect_status "refresh without Origin is refused" 403
  request POST "$WEB_ORIGIN$API_PREFIX/auth/refresh" -H "Cookie: $refresh_cookie" -H "Origin: $ADMIN_ORIGIN"
  expect_status "refresh from the admin origin rotates the token" 200
  request POST "$WEB_ORIGIN$API_PREFIX/auth/register" -H 'Content-Type: application/json' --data '{}'
  expect_status "POST auth/register does not exist (SPEC §12-2)" 404
}

check_two_factor() {
  echo "Two-factor endpoints"
  request POST "$WEB_ORIGIN$API_PREFIX/auth/2fa/totp/setup"
  expect_status "2fa/totp/setup needs a Bearer token" 401
  request POST "$WEB_ORIGIN$API_PREFIX/auth/2fa/verify" -H 'Content-Type: application/json' \
    --data '{"tempToken":"forged","code":"123456"}'
  expect_status "2fa/verify rejects a forged temp token" 401
}

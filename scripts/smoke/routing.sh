# Smoke section: routing through the proxy (web, admin SPA, health, trailing
# slashes). Sourced by scripts/smoke.sh, which provides request, header, pass,
# fail and expect_*.

check_routing() {
  echo "Routing"
  request GET "$WEB_ORIGIN/"
  expect_status "web /" 200
  # Next.js, not an SPA: an unknown path is a real 404, never a 3xx or 200 fallback.
  request GET "$WEB_ORIGIN$WEB_UNKNOWN_PATH"
  expect_status "web unknown path is a 404 (no SPA fallback)" 404
  # Trailing-slash page: Next.js answers 308 with a relative Location (never the
  # container's own http://<host>:<port> URL).
  request GET "$WEB_ORIGIN$WEB_SLASH_PATH"
  expect_status "web page with a trailing slash redirects" 308
  local web_location web_asset
  web_location="$(header Location)"
  if [[ "$web_location" == "$WEB_UNKNOWN_PATH" ]]; then
    pass "web redirect Location is relative ($web_location)"
  else
    fail "web redirect Location: expected '$WEB_UNKNOWN_PATH', got '$web_location'"
  fi
  # A hashed build asset is cached as immutable.
  request GET "$WEB_ORIGIN/"
  web_asset="$(grep -oE '/_next/static/[^"]+\.(js|css)' "$BODY" | head -n 1 || true)"
  if [[ -z "$web_asset" ]]; then
    fail "web home page references no /_next/static asset"
  else
    request GET "$WEB_ORIGIN$web_asset"
    expect_status "web static asset $web_asset" 200
    if [[ "$(header Cache-Control)" == *immutable* ]]; then pass "web static asset is cached as immutable"; else fail "web static asset Cache-Control: '$(header Cache-Control)'"; fi
  fi
  request GET "$ADMIN_ORIGIN/"
  expect_status "admin SPA /" 200
  request GET "$ADMIN_ORIGIN/accounts/settings"
  expect_status "admin SPA fallback for a client route" 200
}

check_health() {
  echo "Health through the proxy"
  request GET "$WEB_ORIGIN$API_PREFIX/health/ready"
  expect_status "GET health/ready" 200
  if grep -q "$HEALTH_OK_BODY" "$BODY"; then pass "health/ready body is {status: ok}"; else fail "health/ready body: $(cat "$BODY")"; fi
}

check_trailing_slashes() {
  echo "Trailing slashes (SPEC §12-17: never 3xx)"
  request GET "$WEB_ORIGIN$API_PREFIX/health/live/"
  expect_status "GET health/live/ with trailing slash" 200
  request POST "$WEB_ORIGIN$API_PREFIX/health/live/" -H 'Content-Type: application/json' --data '{}'
  if [[ "$STATUS" =~ ^3 || "$STATUS" == "000" ]]; then
    fail "POST with trailing slash returned $STATUS"
  else
    pass "POST with trailing slash is not a redirect ($STATUS)"
  fi
}

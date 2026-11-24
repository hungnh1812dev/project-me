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
  request GET "$ADMIN_ORIGIN/api-tokens"
  expect_status "admin SPA route /api-tokens is not taken by the /api router" 200
}

# Global RULES "Health routes": the admin host's /health is cms-api's public answer; /health/live and
# /health/ready are the proxy's 403 on both hosts (with and without a trailing slash), never an app's.
check_health() {
  echo "Health through the proxy"
  request GET "$ADMIN_ORIGIN$CMS_API_HEALTH_PATH"
  expect_status "GET $CMS_API_HEALTH_PATH on the admin host" 200
  if grep -q "$HEALTH_OK_BODY" "$BODY"; then pass "$CMS_API_HEALTH_PATH body is {status: ok}"; else fail "$CMS_API_HEALTH_PATH body: $(cat "$BODY")"; fi
  expect_header "$CMS_API_HEALTH_PATH is cms-api's (its CSP)" Content-Security-Policy "$API_CSP_VALUE"
  local origin path
  for origin in "$ADMIN_ORIGIN" "$WEB_ORIGIN"; do
    for path in "$HEALTH_LIVE_PATH" "$HEALTH_LIVE_PATH/" "$HEALTH_READY_PATH" "$HEALTH_READY_PATH/"; do
      request GET "$origin$path"
      expect_status "$origin$path is closed by the proxy" "$PROXY_DENIED_STATUS"
      if grep -q "$HEALTH_OK_BODY\|errorCode" "$BODY"; then fail "$origin$path body is an app's: $(head -c 200 "$BODY")"; else pass "$origin$path carries no app body"; fi
    done
  done
  request GET "$ADMIN_ORIGIN$API_PREFIX$HEALTH_LIVE_PATH"
  expect_status "removed $API_PREFIX$HEALTH_LIVE_PATH is cms-api's 404" 404
  if grep -q errorCode "$BODY"; then pass "removed health path answers a cms-api error body"; else fail "removed health path body: $(cat "$BODY")"; fi
  request GET "$ADMIN_ORIGIN$ADMIN_SPA_NEAR_HEALTH_PATH"
  expect_status "$ADMIN_SPA_NEAR_HEALTH_PATH is not taken by the health router" 200
  if grep -qi '<html' "$BODY"; then pass "$ADMIN_SPA_NEAR_HEALTH_PATH is the admin SPA"; else fail "$ADMIN_SPA_NEAR_HEALTH_PATH body: $(head -c 200 "$BODY")"; fi
}

# in_network_get <service> <path> [port-expression]: asks a service from inside its own container;
# sets IN_NETWORK_STATUS and IN_NETWORK_BODY. Nothing is stopped; the down cases are qc's.
in_network_get() {
  local service="$1" path="$2" port="$3" output
  output="$(compose exec -T "$service" sh -c "wget -S -O- \"http://127.0.0.1:$port$path\" 2>&1" || true)"
  IN_NETWORK_STATUS="$(printf '%s\n' "$output" | grep -m1 -oE 'HTTP/[0-9.]+ [0-9]+' | awk '{print $2}')"
  IN_NETWORK_BODY="$output"
}

# Rules 2-3 inside the network: each app answers all three routes itself, on its own port.
check_health_in_network() {
  echo "Health inside the network"
  local service port path
  for service in cms-api web cms-admin; do
    case "$service" in
      cms-api) port="$CMS_API_CONTAINER_PORT" ;;
      web) port='$WEB_PORT' ;;
      cms-admin) port="$CMS_ADMIN_CONTAINER_PORT" ;;
    esac
    for path in "$CMS_API_HEALTH_PATH" "$HEALTH_LIVE_PATH" "$HEALTH_READY_PATH"; do
      in_network_get "$service" "$path" "$port"
      if [[ "$IN_NETWORK_STATUS" == "200" ]]; then pass "$service $path (200)"; else fail "$service $path: expected 200, got '$IN_NETWORK_STATUS'"; fi
      if [[ "$path" != "$HEALTH_READY_PATH" ]]; then
        if grep -q "$HEALTH_OK_BODY" <<<"$IN_NETWORK_BODY"; then pass "$service $path body is {status: ok}"; else fail "$service $path body: $IN_NETWORK_BODY"; fi
      fi
    done
  done
  in_network_get cms-admin "$ADMIN_UNKNOWN_HEALTH_PATH" "$CMS_ADMIN_CONTAINER_PORT"
  if [[ "$IN_NETWORK_STATUS" == "404" ]]; then pass "cms-admin $ADMIN_UNKNOWN_HEALTH_PATH is a 404"; else fail "cms-admin $ADMIN_UNKNOWN_HEALTH_PATH: expected 404, got '$IN_NETWORK_STATUS'"; fi
  if grep -qi '<html' <<<"$IN_NETWORK_BODY"; then fail "cms-admin $ADMIN_UNKNOWN_HEALTH_PATH answers the app shell"; else pass "cms-admin $ADMIN_UNKNOWN_HEALTH_PATH is not the app shell"; fi
}

# D21: cms-api is reachable on the admin host only; on the web host /api/v1/* is
# the web BFF and the removed /bff/v1 path answers web's own 404.
check_api_absent_on_web_host() {
  local path
  for path in "$HEALTH_LIVE_PATH" "$HEALTH_READY_PATH"; do
    request GET "$WEB_ORIGIN$path"
    expect_status "$path on the web origin is the proxy's, not an app's" "$PROXY_DENIED_STATUS"
  done
  request GET "$WEB_ORIGIN$API_PREFIX$HEALTH_LIVE_PATH"
  expect_status "cms-api is not served on the web origin ($API_PREFIX$HEALTH_LIVE_PATH; the web answers its own 404)" 404
  request GET "$WEB_ORIGIN$WEB_BFF_HEALTH_PATH"
  expect_status "web BFF answers $WEB_BFF_HEALTH_PATH" 200
  if grep -q "$HEALTH_OK_BODY" "$BODY"; then pass "web BFF health body is {status: ok}"; else fail "web BFF health body: $(cat "$BODY")"; fi
  if [[ "$(header Cache-Control)" == *"$BFF_CACHE_CONTROL"* ]]; then pass "web BFF health is $BFF_CACHE_CONTROL"; else fail "web BFF health Cache-Control: '$(header Cache-Control)'"; fi
  request GET "$WEB_ORIGIN$WEB_REMOVED_BFF_HEALTH_PATH"
  expect_status "removed $WEB_REMOVED_BFF_HEALTH_PATH is a 404, not a redirect" 404
}

# PS-8: GET /health on the web host is 200 {"status":"ok"}, no-store; HEAD has no body; no sub-path.
check_uptime_route() {
  request GET "$WEB_ORIGIN$WEB_UPTIME_PATH"
  expect_status "web uptime check GET $WEB_UPTIME_PATH" 200
  if grep -q "$HEALTH_OK_BODY" "$BODY"; then pass "web uptime body is {status: ok}"; else fail "web uptime body: $(cat "$BODY")"; fi
  if [[ "$(header Cache-Control)" == *"$BFF_CACHE_CONTROL"* ]]; then pass "web uptime is $BFF_CACHE_CONTROL"; else fail "web uptime Cache-Control: '$(header Cache-Control)'"; fi
  request HEAD "$WEB_ORIGIN$WEB_UPTIME_PATH" --head
  expect_status "web uptime check HEAD $WEB_UPTIME_PATH" 200
  # --head makes curl write the response headers into $BODY, so a body shows as the JSON payload.
  if grep -q "$HEALTH_OK_BODY" "$BODY"; then fail "web uptime HEAD carries a body: $(cat "$BODY")"; else pass "web uptime HEAD has no body"; fi
  request GET "$WEB_ORIGIN$WEB_UPTIME_PATH/anything"
  expect_status "web $WEB_UPTIME_PATH/anything is a 404" 404
}

check_trailing_slashes() {
  echo "Trailing slashes (SPEC §12-17: never 3xx)"
  request GET "$ADMIN_ORIGIN$CMS_API_HEALTH_PATH/"
  expect_status "GET $CMS_API_HEALTH_PATH/ with trailing slash" 200
  request POST "$ADMIN_ORIGIN$CMS_API_HEALTH_PATH/" -H 'Content-Type: application/json' --data '{}'
  if [[ "$STATUS" =~ ^3 || "$STATUS" == "000" ]]; then
    fail "POST with trailing slash returned $STATUS"
  else
    pass "POST with trailing slash is not a redirect ($STATUS)"
  fi
}

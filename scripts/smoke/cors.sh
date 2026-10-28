# Smoke section: CORS from the admin origin to the API. Sourced by scripts/smoke.sh.

check_cors() {
  echo "CORS admin -> API"
  request OPTIONS "$WEB_ORIGIN$API_PREFIX/health/live" \
    -H "Origin: $ADMIN_ORIGIN" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization,content-type'
  expect_status "preflight" 204
  expect_header "preflight allows the admin origin" Access-Control-Allow-Origin "$ADMIN_ORIGIN"
  expect_header "preflight allows credentials" Access-Control-Allow-Credentials "true"

  request GET "$WEB_ORIGIN$API_PREFIX/health/live" -H "Origin: $ADMIN_ORIGIN"
  expect_status "actual cross-origin call" 200
  expect_header "actual call allows the admin origin" Access-Control-Allow-Origin "$ADMIN_ORIGIN"
  expect_header "actual call allows credentials" Access-Control-Allow-Credentials "true"
  expect_header "actual call exposes the request id and Retry-After" Access-Control-Expose-Headers "x-request-id,Retry-After"

  request GET "$WEB_ORIGIN$API_PREFIX/health/live" -H "Origin: $OTHER_ORIGIN"
  expect_header "another origin gets no Access-Control-Allow-Origin" Access-Control-Allow-Origin ""
}

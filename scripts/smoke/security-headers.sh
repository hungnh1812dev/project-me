# Smoke section: security headers and CSP nonces (SPEC D17). Sourced by
# scripts/smoke.sh.

TURNSTILE_ORIGIN="https://challenges.cloudflare.com"
CLOUDINARY_ORIGIN="https://res.cloudinary.com"
# Header values the first checked response (web /) sent; every later response
# must send the same ones, so the web, admin and 404 pages cannot drift apart.
COMMON_HEADER_NAMES=(Strict-Transport-Security X-Content-Type-Options Referrer-Policy)

# header_count <name>: how many times the last response sent a header.
header_count() {
  awk -v name="$(echo "$1" | tr '[:upper:]' '[:lower:]')" -F':' '
    tolower($1) == name { n++ } END { print n + 0 }
  ' "$HEADERS"
}

expect_common_headers_agree() {
  local label="$1" name actual first_file
  for name in "${COMMON_HEADER_NAMES[@]}"; do
    actual="$(header "$name")"
    first_file="$WORK_DIR/first-$name"
    if [[ ! -f "$first_file" ]]; then
      printf '%s' "$actual" >"$first_file"
    elif [[ "$actual" != "$(cat "$first_file")" ]]; then
      fail "$label: $name differs from web /: '$actual' vs '$(cat "$first_file")'"
    fi
  done
}

expect_common_security_headers() {
  local label="$1"
  expect_common_headers_agree "$label"
  expect_header "$label sends HSTS" Strict-Transport-Security "$HSTS_VALUE"
  expect_header "$label sends nosniff" X-Content-Type-Options nosniff
  expect_header "$label sends Referrer-Policy" Referrer-Policy "$REFERRER_POLICY_VALUE"
  expect_header "$label sends no X-Powered-By" X-Powered-By ""
}

nonce_of() { header Content-Security-Policy | sed -n "s/.*'nonce-\([^']*\)'.*/\1/p" | head -n 1; }

check_web_security_headers() {
  request GET "$WEB_ORIGIN/"
  expect_common_security_headers "web /"
  local web_csp web_nonce_1 web_nonce_2
  web_csp="$(header Content-Security-Policy)"
  web_nonce_1="$(nonce_of)"
  if [[ -n "$web_nonce_1" ]]; then pass "web CSP carries a script nonce"; else fail "web CSP has no nonce: '$web_csp'"; fi
  if [[ "$web_csp" == *"script-src 'self' 'nonce-"*"'strict-dynamic'"*"$TURNSTILE_ORIGIN"* ]]; then pass "web CSP script-src: nonce + strict-dynamic + Turnstile"; else fail "web CSP script-src: '$web_csp'"; fi
  if [[ "$web_csp" == *"frame-ancestors 'none'"* && "$web_csp" == *"style-src-attr 'unsafe-inline'"* && "$web_csp" == *"$CLOUDINARY_ORIGIN"* ]]; then pass "web CSP has frame-ancestors, style-src-attr and Cloudinary img-src"; else fail "web CSP directives: '$web_csp'"; fi
  # The nonce on the page must match the header, and change on every response.
  if grep -q "nonce=\"$web_nonce_1\"" "$BODY"; then pass "web page scripts carry the header nonce"; else fail "web page has no script with the header nonce"; fi
  request GET "$WEB_ORIGIN/"
  web_nonce_2="$(nonce_of)"
  if [[ -n "$web_nonce_2" && "$web_nonce_2" != "$web_nonce_1" ]]; then pass "web nonce is fresh per response"; else fail "web nonce repeated: '$web_nonce_1' '$web_nonce_2'"; fi
  request GET "$WEB_ORIGIN$WEB_UNKNOWN_PATH"
  expect_common_security_headers "web 404"
}

check_admin_security_headers() {
  request GET "$ADMIN_ORIGIN/"
  expect_common_security_headers "admin /"
  local admin_csp admin_style_nonce
  admin_csp="$(header Content-Security-Policy)"
  if [[ "$admin_csp" == *"script-src 'self';"* && "$admin_csp" == *"connect-src 'self' $WEB_ORIGIN;"* && "$admin_csp" == *"$CLOUDINARY_ORIGIN"* ]]; then pass "admin CSP: script-src self, connect-src is the API origin (no path), Cloudinary img-src"; else fail "admin CSP: '$admin_csp'"; fi
  # style-src carries a per-request nonce (Radix scroll-lock style); the HTML
  # shell exposes the same value in a meta tag, and it changes per response.
  admin_style_nonce="$(nonce_of)"
  if [[ -n "$admin_style_nonce" && "$admin_csp" == *"style-src 'self' 'nonce-$admin_style_nonce';"* ]]; then pass "admin style-src has a nonce (no unsafe-inline)"; else fail "admin style-src: '$admin_csp'"; fi
  if grep -q "<meta name=\"csp-nonce\" content=\"$admin_style_nonce\">" "$BODY"; then pass "admin HTML meta csp-nonce matches the header"; else fail "admin HTML has no matching csp-nonce meta"; fi
  request GET "$ADMIN_ORIGIN/"
  if [[ -n "$(nonce_of)" && "$(nonce_of)" != "$admin_style_nonce" ]]; then pass "admin nonce is fresh per response"; else fail "admin nonce repeated"; fi
  request GET "$ADMIN_ORIGIN/accounts/settings"
  expect_common_security_headers "admin client route"
  if grep -q "<meta name=\"csp-nonce\" content=\"$(nonce_of)\">" "$BODY"; then pass "admin client route HTML carries the matching nonce meta"; else fail "admin client route has no matching nonce meta"; fi
}

check_api_security_headers() {
  request GET "$WEB_ORIGIN$API_PREFIX/health/live"
  expect_header "API sends default-src 'none'" Content-Security-Policy "$API_CSP_VALUE"
  if [[ "$(header_count Content-Security-Policy)" == "1" ]]; then pass "API has exactly one CSP header (Traefik adds none)"; else fail "API CSP header count: $(header_count Content-Security-Policy)"; fi
  expect_header "API sends no X-Powered-By" X-Powered-By ""
  request POST "$WEB_ORIGIN$API_PREFIX/graphql" -H 'Content-Type: application/json' --data '{"query":"{__typename}"}'
  expect_header "POST /graphql sends default-src 'none'" Content-Security-Policy "$API_CSP_VALUE"
  expect_header "POST /graphql sends no X-Powered-By" X-Powered-By ""
}

check_security_headers() {
  echo "Security headers (SPEC D17)"
  check_web_security_headers
  check_admin_security_headers
  check_api_security_headers
}

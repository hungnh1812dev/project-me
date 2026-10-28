#!/bin/sh
# Entrypoint script of the nginx image: renders the security headers include.
# CSP connect-src needs origins (a host-source with a path matches that exact
# URL only), so unless CSP_CONNECT_SRC is set it is the origin of CSP_API_URL.
set -eu

TEMPLATE=/etc/nginx/security/security-headers.inc.template
TARGET=/etc/nginx/conf.d/security-headers.inc

if [ -z "${CSP_CONNECT_SRC:-}" ]; then
  CSP_CONNECT_SRC="$(printf '%s' "${CSP_API_URL:-}" | sed -E 's#^(https?://[^/]+).*#\1#')"
fi
export CSP_CONNECT_SRC

envsubst '${CSP_CONNECT_SRC}' < "$TEMPLATE" > "$TARGET"

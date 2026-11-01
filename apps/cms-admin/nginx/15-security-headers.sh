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

# CSP_EXTRA_IMG_SRC (test stacks only): extra img-src origins. It lands inside
# the header, so anything but space-separated http(s)://host[:port] is refused.
ORIGIN_PATTERN='^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'
extra_img_src=""
if [ -n "${CSP_EXTRA_IMG_SRC:-}" ]; then
  if [ -n "$(printf '%s' "$CSP_EXTRA_IMG_SRC" | tr -d 'A-Za-z0-9.:/ -')" ]; then
    echo "CSP_EXTRA_IMG_SRC must be space-separated http(s)://host[:port] origins" >&2
    exit 1
  fi
  set -f
  for origin in $CSP_EXTRA_IMG_SRC; do
    if ! printf '%s\n' "$origin" | grep -Eq "$ORIGIN_PATTERN"; then
      echo "CSP_EXTRA_IMG_SRC has an invalid origin: $origin" >&2
      exit 1
    fi
    extra_img_src="$extra_img_src $origin"
  done
  set +f
fi
CSP_EXTRA_IMG_SRC="$extra_img_src"
export CSP_EXTRA_IMG_SRC

envsubst '${CSP_CONNECT_SRC} ${CSP_EXTRA_IMG_SRC}' < "$TEMPLATE" > "$TARGET"

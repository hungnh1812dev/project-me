#!/bin/sh
# Entrypoint script of the nginx image: renders the health routes include
# (the resolver and the cms-api live URL that /health/ready asks, ADM-12).
set -eu

TEMPLATE=/etc/nginx/security/health-routes.inc.template
TARGET=/etc/nginx/conf.d/health-routes.inc
ORIGIN_PATTERN='^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'

ORIGIN_ERROR="APP_API_ORIGIN is required and must be http(s)://host[:port] with no path"

# grep matches per line, so a multi-line value must be rejected on the whole value first.
case "${APP_API_ORIGIN:-}" in
  *[!A-Za-z0-9.:/-]*)
    echo "$ORIGIN_ERROR" >&2
    exit 1
    ;;
esac

if ! printf '%s\n' "${APP_API_ORIGIN:-}" | grep -Eq "$ORIGIN_PATTERN"; then
  echo "$ORIGIN_ERROR" >&2
  exit 1
fi

HEALTH_RESOLVER="$(awk '$1 == "nameserver" && $2 !~ /:/ { print $2; exit }' /etc/resolv.conf)"
if [ -z "$HEALTH_RESOLVER" ]; then
  echo "No IPv4 nameserver in /etc/resolv.conf for the health routes resolver" >&2
  exit 1
fi
export HEALTH_RESOLVER APP_API_ORIGIN

envsubst '${HEALTH_RESOLVER} ${APP_API_ORIGIN}' < "$TEMPLATE" > "$TARGET"

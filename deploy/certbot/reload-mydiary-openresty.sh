#!/bin/sh
set -eu
umask 077

DOMAIN="${DIARY_DOMAIN:?Set DIARY_DOMAIN}"
OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:?Set OPENRESTY_CONTAINER}"
SITE_ROOT="${OPENRESTY_SITE_ROOT:?Set OPENRESTY_SITE_ROOT}"

SOURCE="/etc/letsencrypt/live/$DOMAIN"
TARGET="$SITE_ROOT/$DOMAIN/ssl"

install -d -m 700 "$TARGET"
install -m 644 "$SOURCE/fullchain.pem" "$TARGET/fullchain.pem"
install -m 600 "$SOURCE/privkey.pem" "$TARGET/privkey.pem"

docker exec "$OPENRESTY_CONTAINER" openresty -t >/dev/null 2>&1
docker exec "$OPENRESTY_CONTAINER" openresty -s reload >/dev/null 2>&1

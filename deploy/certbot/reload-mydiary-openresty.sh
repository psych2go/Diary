#!/bin/sh
set -eu
umask 077

SOURCE=/etc/letsencrypt/live/diary.zhuying.fun
TARGET=/opt/1panel/apps/openresty/openresty/www/sites/diary.zhuying.fun/ssl

install -d -m 700 "$TARGET"
install -m 644 "$SOURCE/fullchain.pem" "$TARGET/fullchain.pem"
install -m 600 "$SOURCE/privkey.pem" "$TARGET/privkey.pem"

docker exec 1Panel-openresty-bpci openresty -t >/dev/null 2>&1
docker exec 1Panel-openresty-bpci openresty -s reload >/dev/null 2>&1

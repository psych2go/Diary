#!/bin/sh
set -eu

manifest="$(curl --fail --silent --show-error \
  https://diary.zhuying.fun/manifest.webmanifest)"
asset_links="$(curl --fail --silent --show-error \
  https://diary.zhuying.fun/.well-known/assetlinks.json)"

printf '%s' "$manifest" | grep -q '"name"[[:space:]]*:[[:space:]]*"日记"'
printf '%s' "$asset_links" | grep -q '"package_name":"fun.zhuying.diary"'

printf '%s\n' "Domain, PWA manifest, and Digital Asset Links are ready."

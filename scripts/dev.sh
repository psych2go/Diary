#!/bin/sh
set -eu

restore_terminal() {
  stty echo 2>/dev/null || true
}

trap restore_terminal EXIT INT TERM
printf 'Development password: ' >&2
stty -echo
IFS= read -r password
stty echo
printf '\n' >&2

if [ -z "$password" ]; then
  printf '%s\n' "Password cannot be empty." >&2
  exit 1
fi

trap - EXIT INT TERM
export DIARY_PASSWORD="$password"
exec node --watch server.js

#!/bin/sh
set -eu

restore_terminal() {
  stty echo 2>/dev/null || true
}

trap restore_terminal EXIT INT TERM
printf '%s' "Password: " >&2
stty -echo
IFS= read -r password
stty echo
printf '\n' >&2
trap - EXIT INT TERM

if [ -z "$password" ]; then
  printf '%s\n' "Password cannot be empty." >&2
  exit 1
fi

printf '%s' "$password" | node "$(dirname "$0")/hash-password.mjs"
unset password

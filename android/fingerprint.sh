#!/bin/sh
set -eu

KEYSTORE="${ANDROID_KEYSTORE_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/my-diary/android/diary.keystore}"
PASSWORD_FILE="${ANDROID_KEYSTORE_PASSWORD_FILE:-}"

if [ ! -f "$KEYSTORE" ]; then
  printf '%s\n' "Signing key not found. Run android/create-signing-key.sh first." >&2
  exit 1
fi

if [ -n "$PASSWORD_FILE" ]; then
  keytool -list -v \
    -keystore "$KEYSTORE" \
    -alias diary \
    -storepass:file "$PASSWORD_FILE" |
    sed -n 's/^[[:space:]]*SHA256: //p'
else
  keytool -list -v -keystore "$KEYSTORE" -alias diary |
    sed -n 's/^[[:space:]]*SHA256: //p'
fi

#!/bin/sh
set -eu
umask 077

KEY_DIRECTORY="${XDG_CONFIG_HOME:-$HOME/.config}/my-diary/android"
KEYSTORE="$KEY_DIRECTORY/diary.keystore"
PASSWORD_FILE="${ANDROID_KEYSTORE_PASSWORD_FILE:-}"
KEY_DNAME="${ANDROID_KEY_DNAME:-CN=MyDiary, OU=Android, O=Example}"

if ! command -v keytool >/dev/null 2>&1; then
  printf '%s\n' "keytool was not found. Install JDK 17 first." >&2
  exit 1
fi

if [ -e "$KEYSTORE" ]; then
  printf '%s\n' "Signing key already exists: $KEYSTORE" >&2
  exit 1
fi

mkdir -p "$KEY_DIRECTORY"
if [ -n "$PASSWORD_FILE" ]; then
  if [ ! -f "$PASSWORD_FILE" ]; then
    printf '%s\n' "Keystore password file not found: $PASSWORD_FILE" >&2
    exit 1
  fi
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -alias diary \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "$KEY_DNAME" \
    -storepass:file "$PASSWORD_FILE" \
    -keypass:file "$PASSWORD_FILE"
else
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -alias diary \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "$KEY_DNAME"
fi
chmod 600 "$KEYSTORE"

printf '\n%s\n' "Signing key created. Back up the keystore and its password."
printf '%s\n' "Run android/fingerprint.sh and put the result in ANDROID_SHA256_FINGERPRINTS."

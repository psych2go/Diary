#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
KEYSTORE="${ANDROID_KEYSTORE_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/my-diary/android/diary.keystore}"
PASSWORD_FILE="${ANDROID_KEYSTORE_PASSWORD_FILE:-}"
ANDROID_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
GRADLE_COMMAND="${GRADLE_EXECUTABLE:-./gradlew}"

"$SCRIPT_DIR/verify-domain.sh"

if [ ! -f "$KEYSTORE" ]; then
  printf '%s\n' "Signing key not found. Run android/create-signing-key.sh first." >&2
  exit 1
fi

if [ -z "$ANDROID_SDK" ]; then
  printf '%s\n' "ANDROID_SDK_ROOT or ANDROID_HOME is required." >&2
  exit 1
fi
if [ -n "$PASSWORD_FILE" ] && [ ! -f "$PASSWORD_FILE" ]; then
  printf '%s\n' "Keystore password file not found: $PASSWORD_FILE" >&2
  exit 1
fi

build_tools="$ANDROID_SDK/build-tools"
latest_build_tools="$(find "$build_tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
if [ -z "$latest_build_tools" ]; then
  printf '%s\n' "Android build-tools were not found." >&2
  exit 1
fi

cd "$SCRIPT_DIR"
"$GRADLE_COMMAND" --no-daemon clean assembleRelease bundleRelease

"$latest_build_tools/zipalign" -p -f 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  app-release-aligned.apk
if [ -n "$PASSWORD_FILE" ]; then
  "$latest_build_tools/apksigner" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias diary \
    --ks-pass "file:$PASSWORD_FILE" \
    --out app-release-signed.apk \
    app-release-aligned.apk
else
  "$latest_build_tools/apksigner" sign \
    --ks "$KEYSTORE" \
    --ks-key-alias diary \
    --out app-release-signed.apk \
    app-release-aligned.apk
fi
"$latest_build_tools/apksigner" verify --verbose app-release-signed.apk
rm -f app-release-aligned.apk

cp app/build/outputs/bundle/release/app-release.aab app-release-bundle.aab
if [ -n "$PASSWORD_FILE" ]; then
  jarsigner \
    -keystore "$KEYSTORE" \
    -storepass:file "$PASSWORD_FILE" \
    app-release-bundle.aab diary
else
  jarsigner -keystore "$KEYSTORE" app-release-bundle.aab diary
fi
jarsigner -verify app-release-bundle.aab

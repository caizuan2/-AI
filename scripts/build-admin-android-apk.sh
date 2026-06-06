#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
OUTPUT_DIR="$ROOT/dist-app/admin-android"
PUBLIC_ADMIN_DIR="$ROOT/public/downloads/admin"
BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
ADMIN_CONFIG="$ROOT/capacitor.admin.config.ts"
USER_CONFIG="$ROOT/capacitor.config.ts"

mkdir -p "$OUTPUT_DIR" "$PUBLIC_ADMIN_DIR"
rm -rf "$OUTPUT_DIR"/*
rm -f "$PUBLIC_ADMIN_DIR/ai-knowledge-admin.apk" "$PUBLIC_ADMIN_DIR/ai-knowledge-admin-latest.apk"

ORIGINAL_BUILD_GRADLE="$(mktemp)"
ORIGINAL_USER_CONFIG="$(mktemp)"
cp "$BUILD_GRADLE" "$ORIGINAL_BUILD_GRADLE"
cp "$USER_CONFIG" "$ORIGINAL_USER_CONFIG"

restore_user_config() {
  cp "$ORIGINAL_BUILD_GRADLE" "$BUILD_GRADLE"
  cp "$ORIGINAL_USER_CONFIG" "$USER_CONFIG"
  (cd "$ROOT" && npx cap sync android) || true
}

trap restore_user_config EXIT

cd "$ROOT"
if ! npx cap sync android --config capacitor.admin.config.ts; then
  cp "$ADMIN_CONFIG" "$USER_CONFIG"
  npx cap sync android
fi

perl -0pi -e 's/applicationId\s+"[^"]+"/applicationId "com.aiknowledge.admin"/' "$BUILD_GRADLE"
(cd "$ANDROID_DIR" && ./gradlew assembleDebug)

cp "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_DIR/ai-knowledge-admin.apk"
cp "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_DIR/ai-knowledge-admin-latest.apk"
ls -lh "$OUTPUT_DIR"

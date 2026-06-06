#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
OUTPUT_DIR="$ROOT/dist-app/android"
OUTPUT_APK="$OUTPUT_DIR/AI知识库助手.apk"

cd "$ROOT"

if [ ! -d "$ROOT/node_modules/@capacitor/core" ]; then
  echo "Capacitor dependencies are missing. Please run pnpm install before building Android APK." >&2
  exit 1
fi

if [ ! -d "$ANDROID_DIR" ]; then
  npx cap add android
fi

npx cap sync android

if [ ! -f "$ANDROID_DIR/gradlew" ]; then
  echo "Android Gradle wrapper was not found. Run npx cap add android again." >&2
  exit 1
fi

if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] &&
  [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ] &&
  [ -n "${ANDROID_KEY_ALIAS:-}" ] &&
  [ -n "${ANDROID_KEY_PASSWORD:-}" ]; then
  BUILD_TASK="assembleRelease"
else
  BUILD_TASK="assembleDebug"
fi

(cd "$ANDROID_DIR" && ./gradlew "$BUILD_TASK")

SOURCE_APK=""
for candidate in \
  "$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk" \
  "$ANDROID_DIR/app/build/outputs/apk/release/app-release-unsigned.apk" \
  "$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"; do
  if [ -f "$candidate" ]; then
    SOURCE_APK="$candidate"
    break
  fi
done

if [ -z "$SOURCE_APK" ]; then
  echo "No APK was generated under android/app/build/outputs/apk." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cp "$SOURCE_APK" "$OUTPUT_APK"

echo "Android APK generated: $OUTPUT_APK"

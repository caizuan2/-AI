#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/dist-app/macos"
FINAL_DMG="$OUTPUT_DIR/ai-knowledge-chat.dmg"
LATEST_DMG="$OUTPUT_DIR/ai-knowledge-chat-latest.dmg"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS DMG 需要在 macOS 环境打包。"
  exit 0
fi

if [[ ! -d "$ROOT/node_modules/electron-builder" ]]; then
  echo "electron-builder dependency is missing. Please run pnpm install before building macOS DMG."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
export USER_APP_URL="${USER_APP_URL:-https://stately-sawine-1efd4d.netlify.app/chat-ui}"

(cd "$ROOT" && npx electron-builder --config electron-builder.mac.user.yml --mac dmg)

GENERATED_DMG="$(find "$OUTPUT_DIR" -maxdepth 2 -type f -name '*.dmg' ! -name 'ai-knowledge-chat.dmg' ! -name 'ai-knowledge-chat-latest.dmg' | head -n 1 || true)"
if [[ -z "$GENERATED_DMG" && -f "$FINAL_DMG" ]]; then
  GENERATED_DMG="$FINAL_DMG"
fi
if [[ -z "$GENERATED_DMG" ]]; then
  echo "No user macOS DMG was generated under $OUTPUT_DIR."
  exit 1
fi

cp "$GENERATED_DMG" "$FINAL_DMG"
cp "$GENERATED_DMG" "$LATEST_DMG"
ls -lh "$FINAL_DMG" "$LATEST_DMG"

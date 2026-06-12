#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/dist-app/admin-macos"
FINAL_DMG="$OUTPUT_DIR/ai-knowledge-admin.dmg"
LATEST_DMG="$OUTPUT_DIR/ai-knowledge-admin-latest.dmg"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS DMG 需要在 macOS 环境打包。"
  exit 0
fi

if [[ ! -d "$ROOT/node_modules/electron-builder" ]]; then
  echo "electron-builder dependency is missing. Please run pnpm install before building admin macOS DMG."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
export ADMIN_APP_URL="${ADMIN_APP_URL:-https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest}"

(cd "$ROOT" && npx electron-builder --config electron-builder.mac.admin.yml --mac dmg)

GENERATED_DMG="$(find "$OUTPUT_DIR" -maxdepth 2 -type f -name '*.dmg' ! -name 'ai-knowledge-admin.dmg' ! -name 'ai-knowledge-admin-latest.dmg' | head -n 1 || true)"
if [[ -z "$GENERATED_DMG" && -f "$FINAL_DMG" ]]; then
  GENERATED_DMG="$FINAL_DMG"
fi
if [[ -z "$GENERATED_DMG" ]]; then
  echo "No admin macOS DMG was generated under $OUTPUT_DIR."
  exit 1
fi

cp "$GENERATED_DMG" "$FINAL_DMG"
cp "$GENERATED_DMG" "$LATEST_DMG"
ls -lh "$FINAL_DMG" "$LATEST_DMG"

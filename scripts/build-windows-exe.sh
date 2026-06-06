#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/dist-app/windows"
OUTPUT_EXE="$OUTPUT_DIR/AI知识库助手.exe"

cd "$ROOT"

if [ ! -d "$ROOT/node_modules/electron" ] || [ ! -d "$ROOT/node_modules/electron-builder" ]; then
  echo "Electron dependencies are missing. Please run pnpm install before building Windows EXE." >&2
  exit 1
fi

export USER_APP_URL="${USER_APP_URL:-https://stately-sawine-1efd4d.netlify.app/chat-ui}"

npx electron-builder --win

GENERATED_EXE="$(find "$OUTPUT_DIR" -name '*.exe' -type f -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

if [ -z "$GENERATED_EXE" ]; then
  echo "No Windows EXE was generated under $OUTPUT_DIR." >&2
  exit 1
fi

if [ "$GENERATED_EXE" != "$OUTPUT_EXE" ]; then
  cp "$GENERATED_EXE" "$OUTPUT_EXE"
fi

echo "Windows EXE generated: $OUTPUT_EXE"

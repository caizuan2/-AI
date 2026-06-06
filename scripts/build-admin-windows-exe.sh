#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/dist-app/admin-windows"

mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"/*

cd "$ROOT"
export ADMIN_APP_URL="${ADMIN_APP_URL:-https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest}"
npx electron-builder --config electron-builder.admin.yml --win

GENERATED_EXE="$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.exe' | sort | head -n 1)"
if [ -z "$GENERATED_EXE" ]; then
  echo "No admin Windows EXE was generated under $OUTPUT_DIR." >&2
  exit 1
fi

cp "$GENERATED_EXE" "$OUTPUT_DIR/ai-knowledge-admin.exe"
cp "$OUTPUT_DIR/ai-knowledge-admin.exe" "$OUTPUT_DIR/ai-knowledge-admin-latest.exe"
ls -lh "$OUTPUT_DIR"/ai-knowledge-admin*.exe

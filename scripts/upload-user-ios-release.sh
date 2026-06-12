#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT/dist-app/ios/ai-knowledge-chat-latest.ipa"
TAG="${GITHUB_RELEASE_TAG:-v1.0.0-user-ios}"

if [[ ! -f "$FILE" ]]; then
  echo "文件不存在，未上传：$FILE"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "未检测到 GitHub CLI gh。请先安装并登录 gh auth login。"
  exit 1
fi

gh release upload "$TAG" "$FILE" --clobber

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/dist-app/admin-ios"
ARCHIVE_PATH="$OUTPUT_DIR/AIKnowledgeAdmin.xcarchive"
EXPORT_DIR="$OUTPUT_DIR/export"
EXPORT_OPTIONS="$OUTPUT_DIR/exportOptions.plist"
FINAL_IPA="$OUTPUT_DIR/ai-knowledge-admin.ipa"
LATEST_IPA="$OUTPUT_DIR/ai-knowledge-admin-latest.ipa"
CONFIG_FILE="capacitor.ios.admin.config.ts"
APP_ID="com.aiknowledge.admin"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iOS IPA 需要在 macOS + Xcode 环境下打包。"
  exit 0
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "未检测到 xcodebuild。请先在 Mac 上安装 Xcode 并完成首次启动配置。"
  exit 1
fi

if [[ ! -d "$ROOT/node_modules/@capacitor/ios" ]]; then
  echo "缺少 @capacitor/ios。请先运行 pnpm install。"
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "未检测到 CocoaPods。若 sync 后存在 Podfile，请先安装 CocoaPods：sudo gem install cocoapods"
fi

mkdir -p "$OUTPUT_DIR"
if [[ ! -d "$ROOT/ios" ]]; then
  (cd "$ROOT" && npx cap add ios --config "$CONFIG_FILE")
fi
(cd "$ROOT" && npx cap sync ios --config "$CONFIG_FILE")

WORKSPACE="$ROOT/ios/App/App.xcworkspace"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="${IOS_SCHEME:-App}"
BUILD_TARGET=()

if [[ -d "$WORKSPACE" ]]; then
  BUILD_TARGET=(-workspace "$WORKSPACE")
elif [[ -d "$PROJECT" ]]; then
  BUILD_TARGET=(-project "$PROJECT")
else
  echo "未找到 iOS 工程。请先运行 npx cap add ios --config $CONFIG_FILE。"
  exit 1
fi

ARCHIVE_ARGS=("${BUILD_TARGET[@]}" -scheme "$SCHEME" -configuration Release -archivePath "$ARCHIVE_PATH" archive)
if [[ -n "${APPLE_TEAM_ID:-}" ]]; then
  ARCHIVE_ARGS+=("DEVELOPMENT_TEAM=$APPLE_TEAM_ID")
fi
if [[ -n "${IOS_SIGNING_STYLE:-}" ]]; then
  ARCHIVE_ARGS+=("CODE_SIGN_STYLE=$IOS_SIGNING_STYLE")
fi

xcodebuild "${ARCHIVE_ARGS[@]}"

if [[ -z "${APPLE_TEAM_ID:-}" && -z "${IOS_PROVISIONING_PROFILE:-}" ]]; then
  echo "iOS archive 已生成：$ARCHIVE_PATH"
  echo "缺少签名导出信息，未导出 IPA。请设置 APPLE_TEAM_ID / IOS_SIGNING_STYLE / IOS_EXPORT_METHOD / IOS_PROVISIONING_PROFILE，或在 Xcode 中 Archive 后 Export。"
  exit 0
fi

EXPORT_METHOD="${IOS_EXPORT_METHOD:-development}"
SIGNING_STYLE="${IOS_SIGNING_STYLE:-automatic}"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  echo '<plist version="1.0">'
  echo '<dict>'
  echo '  <key>method</key>'
  echo "  <string>$EXPORT_METHOD</string>"
  echo '  <key>signingStyle</key>'
  echo "  <string>$SIGNING_STYLE</string>"
  if [[ -n "${APPLE_TEAM_ID:-}" ]]; then
    echo '  <key>teamID</key>'
    echo "  <string>$APPLE_TEAM_ID</string>"
  fi
  if [[ -n "${IOS_PROVISIONING_PROFILE:-}" ]]; then
    echo '  <key>provisioningProfiles</key>'
    echo '  <dict>'
    echo "    <key>$APP_ID</key>"
    echo "    <string>$IOS_PROVISIONING_PROFILE</string>"
    echo '  </dict>'
  fi
  echo '</dict>'
  echo '</plist>'
} > "$EXPORT_OPTIONS"

rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" -exportOptionsPlist "$EXPORT_OPTIONS" -exportPath "$EXPORT_DIR"

GENERATED_IPA="$(find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.ipa' | head -n 1 || true)"
if [[ -z "$GENERATED_IPA" ]]; then
  echo "未在 $EXPORT_DIR 找到导出的 IPA。"
  exit 1
fi

cp "$GENERATED_IPA" "$FINAL_IPA"
cp "$GENERATED_IPA" "$LATEST_IPA"
ls -lh "$FINAL_IPA" "$LATEST_IPA"

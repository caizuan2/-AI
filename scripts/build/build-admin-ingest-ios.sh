#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="capacitor.admin-ingest.ios.config.ts"
IOS_ROOT="$ROOT/ios-admin-ingest"
OUTPUT_ROOT="$ROOT/dist-app/admin-ingest/ios"
ARCHIVE_PATH="$OUTPUT_ROOT/小董AI.xcarchive"
EXPORT_DIR="$OUTPUT_ROOT/export"
EXPORT_OPTIONS="$OUTPUT_ROOT/exportOptions.plist"
ARTIFACT_DIR="$ROOT/artifacts/admin-ingest/ios"
FINAL_IPA="$ARTIFACT_DIR/admin-ingest.ipa"
APP_ID="com.aiknowledge.ingestadmin"
SCHEME="${IOS_SCHEME:-App}"
VERIFY_DIR=""

fail() {
  echo "ADMIN_INGEST_IOS_BUILD_ERROR=$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "$VERIFY_DIR" && -d "$VERIFY_DIR" ]]; then
    rm -rf "$VERIFY_DIR"
  fi
}

trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "DARWIN_REQUIRED"
fi

for command_name in node pnpm xcodebuild xcrun sips unzip codesign; do
  command -v "$command_name" >/dev/null 2>&1 || fail "MISSING_${command_name^^}"
done

XCODE_MAJOR="$(xcodebuild -version | awk '/Xcode/{split($2, parts, "."); print parts[1]; exit}')"
if [[ -z "$XCODE_MAJOR" || "$XCODE_MAJOR" -lt 26 ]]; then
  fail "XCODE_26_OR_NEWER_REQUIRED"
fi

cd "$ROOT"

if [[ -z "${ADMIN_INGEST_APP_URL:-}" ]]; then
  fail "ADMIN_INGEST_APP_URL_REQUIRED"
fi

ADMIN_INGEST_APP_URL="$(
  node -e '
    const url = new URL(process.argv[1]);
    if (url.protocol !== "https:" || !url.pathname.startsWith("/admin-ingest")) {
      throw new Error("HTTPS_ADMIN_INGEST_URL_REQUIRED");
    }
    url.searchParams.set("app", "ingest-admin");
    url.searchParams.set("platform", "ios");
    process.stdout.write(url.toString());
  ' "$ADMIN_INGEST_APP_URL"
)" || fail "INVALID_ADMIN_INGEST_APP_URL"
export ADMIN_INGEST_APP_URL

[[ -n "${APPLE_TEAM_ID:-}" ]] || fail "APPLE_TEAM_ID_REQUIRED"
[[ -n "${IOS_PROVISIONING_PROFILE:-}" ]] || fail "IOS_PROVISIONING_PROFILE_REQUIRED"
[[ -d "$ROOT/node_modules/@capacitor/ios" ]] || fail "CAPACITOR_IOS_DEPENDENCY_MISSING"

if [[ "${ALLOW_DIRTY_APPLE_BUILD:-0}" != "1" ]] && [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=all)" ]]; then
  fail "RELEASE_WORKTREE_NOT_CLEAN"
fi

VERSION="$(node -p "require('./config/admin-ingest/release.json').version")"
BUILD_NUMBER="$(node -p "require('./config/admin-ingest/release.json').build")"
RELEASE_HEAD="${RELEASE_HEAD:-$(git -C "$ROOT" rev-parse HEAD)}"
EXPORT_METHOD="${IOS_EXPORT_METHOD:-app-store-connect}"
SIGNING_STYLE="${IOS_SIGNING_STYLE:-manual}"
if [[ "$SIGNING_STYLE" == "manual" ]]; then
  XCODE_SIGNING_STYLE="Manual"
else
  XCODE_SIGNING_STYLE="Automatic"
fi

mkdir -p "$OUTPUT_ROOT" "$ARTIFACT_DIR"

if [[ ! -d "$IOS_ROOT/App/App.xcodeproj" ]]; then
  (
    cd "$ROOT"
    pnpm exec cap add ios --config "$CONFIG_FILE"
  )
fi

(
  cd "$ROOT"
  pnpm exec cap sync ios --config "$CONFIG_FILE"
)

INFO_PLIST="$IOS_ROOT/App/App/Info.plist"
[[ -f "$INFO_PLIST" ]] || fail "INFO_PLIST_NOT_FOUND"

set_plist_string() {
  local key="$1"
  local value="$2"
  /usr/libexec/PlistBuddy -c "Delete :$key" "$INFO_PLIST" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :$key string $value" "$INFO_PLIST"
}

set_plist_string "CFBundleDisplayName" "小董AI"
set_plist_string "NSMicrophoneUsageDescription" "小董AI需要使用麦克风录制投喂内容并转换为文字。"
set_plist_string "NSCameraUsageDescription" "小董AI需要使用相机拍摄并上传投喂资料。"
set_plist_string "NSPhotoLibraryUsageDescription" "小董AI需要访问照片以选择并上传投喂资料。"

ICON_SET="$IOS_ROOT/App/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ICON_SET"
sips -z 1024 1024 "$ROOT/assets/admin-ingest/web-logo.png" --out "$ICON_SET/AppIcon-1024.png" >/dev/null
cat > "$ICON_SET/Contents.json" <<'JSON'
{
  "images": [
    {
      "filename": "AppIcon-1024.png",
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
JSON

WORKSPACE="$IOS_ROOT/App/App.xcworkspace"
PROJECT="$IOS_ROOT/App/App.xcodeproj"
if [[ -d "$WORKSPACE" ]]; then
  BUILD_TARGET=(-workspace "$WORKSPACE")
elif [[ -d "$PROJECT" ]]; then
  BUILD_TARGET=(-project "$PROJECT")
else
  fail "XCODE_PROJECT_NOT_FOUND"
fi

rm -rf "$ARCHIVE_PATH" "$EXPORT_DIR"

ARCHIVE_ARGS=(
  "${BUILD_TARGET[@]}"
  -scheme "$SCHEME"
  -configuration Release
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
  archive
  "PRODUCT_BUNDLE_IDENTIFIER=$APP_ID"
  "MARKETING_VERSION=$VERSION"
  "CURRENT_PROJECT_VERSION=$BUILD_NUMBER"
  "DEVELOPMENT_TEAM=$APPLE_TEAM_ID"
  "CODE_SIGN_STYLE=$XCODE_SIGNING_STYLE"
)

if [[ -n "${IOS_SIGNING_CERTIFICATE:-}" ]]; then
  ARCHIVE_ARGS+=("CODE_SIGN_IDENTITY=$IOS_SIGNING_CERTIFICATE")
fi
if [[ "$SIGNING_STYLE" == "manual" ]]; then
  ARCHIVE_ARGS+=("PROVISIONING_PROFILE_SPECIFIER=$IOS_PROVISIONING_PROFILE")
fi
if [[ "${IOS_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  ARCHIVE_ARGS+=("-allowProvisioningUpdates")
fi

xcodebuild "${ARCHIVE_ARGS[@]}"

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>$EXPORT_METHOD</string>
  <key>signingStyle</key>
  <string>$SIGNING_STYLE</string>
  <key>teamID</key>
  <string>$APPLE_TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>provisioningProfiles</key>
  <dict>
    <key>$APP_ID</key>
    <string>$IOS_PROVISIONING_PROFILE</string>
  </dict>
</dict>
</plist>
PLIST

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_DIR"

GENERATED_IPA="$(find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
[[ -n "$GENERATED_IPA" && -f "$GENERATED_IPA" ]] || fail "IPA_NOT_FOUND"

cp "$GENERATED_IPA" "$FINAL_IPA"
VERIFY_DIR="$(mktemp -d)"
unzip -q "$FINAL_IPA" -d "$VERIFY_DIR"
SIGNED_APP="$(find "$VERIFY_DIR/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"
[[ -n "$SIGNED_APP" && -d "$SIGNED_APP" ]] || fail "SIGNED_APP_NOT_FOUND"
codesign --verify --deep --strict --verbose=2 "$SIGNED_APP"
node "$ROOT/scripts/build/write-admin-ingest-apple-manifest.mjs" \
  --platform ios \
  --artifact "$FINAL_IPA" \
  --installer-type ipa \
  --product-name "小董AI"

echo "ADMIN_INGEST_IOS_BUILD_OK=true"
echo "ADMIN_INGEST_IOS_PATH=$FINAL_IPA"
echo "ADMIN_INGEST_IOS_VERSION=$VERSION"
echo "ADMIN_INGEST_IOS_BUILD=$BUILD_NUMBER"
echo "ADMIN_INGEST_IOS_HEAD=$RELEASE_HEAD"

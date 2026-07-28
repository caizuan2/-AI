#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="electron/admin-ingest/electron-builder.macos.yml"
OUTPUT_ROOT="$ROOT/dist-app/admin-ingest/macos"
ARTIFACT_DIR="$ROOT/artifacts/admin-ingest/macos"
FINAL_DMG="$ARTIFACT_DIR/admin-ingest.dmg"
BUILD_METADATA="$ROOT/electron/admin-ingest/build-metadata.json"
METADATA_BACKUP=""

fail() {
  echo "ADMIN_INGEST_MACOS_BUILD_ERROR=$1" >&2
  exit 1
}

restore_build_metadata() {
  if [[ -n "$METADATA_BACKUP" && -f "$METADATA_BACKUP" ]]; then
    cp "$METADATA_BACKUP" "$BUILD_METADATA"
    rm -f "$METADATA_BACKUP"
  else
    rm -f "$BUILD_METADATA"
  fi
}

trap restore_build_metadata EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "DARWIN_REQUIRED"
fi

for command_name in node pnpm security codesign spctl xcrun hdiutil; do
  command -v "$command_name" >/dev/null 2>&1 || fail "MISSING_${command_name^^}"
done

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
    url.searchParams.set("platform", "macos");
    process.stdout.write(url.toString());
  ' "$ADMIN_INGEST_APP_URL"
)" || fail "INVALID_ADMIN_INGEST_APP_URL"
export ADMIN_INGEST_APP_URL

[[ -n "${APPLE_ID:-}" ]] || fail "APPLE_ID_REQUIRED"
[[ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] || fail "APPLE_APP_SPECIFIC_PASSWORD_REQUIRED"
[[ -n "${APPLE_TEAM_ID:-}" ]] || fail "APPLE_TEAM_ID_REQUIRED"
[[ -d "$ROOT/node_modules/electron-builder" ]] || fail "ELECTRON_BUILDER_DEPENDENCY_MISSING"

IDENTITIES="$(security find-identity -v -p codesigning)"
if ! grep -q "Developer ID Application" <<<"$IDENTITIES"; then
  fail "DEVELOPER_ID_APPLICATION_IDENTITY_MISSING"
fi

if [[ "${ALLOW_DIRTY_APPLE_BUILD:-0}" != "1" ]] && [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=all)" ]]; then
  fail "RELEASE_WORKTREE_NOT_CLEAN"
fi

VERSION="$(node -p "require('./config/admin-ingest/release.json').version")"
BUILD_NUMBER="$(node -p "require('./config/admin-ingest/release.json').build")"
RELEASE_HEAD="${RELEASE_HEAD:-$(git -C "$ROOT" rev-parse HEAD)}"

mkdir -p "$OUTPUT_ROOT" "$ARTIFACT_DIR"
if [[ -f "$BUILD_METADATA" ]]; then
  METADATA_BACKUP="$(mktemp)"
  cp "$BUILD_METADATA" "$METADATA_BACKUP"
fi

node "$ROOT/scripts/build/write-admin-ingest-build-metadata.mjs" \
  --output "$BUILD_METADATA" \
  --version "$VERSION" \
  --build "$BUILD_NUMBER" \
  --web-release-sha "$RELEASE_HEAD" \
  --web-url "$ADMIN_INGEST_APP_URL" \
  --platform macos

(
  cd "$ROOT"
  pnpm exec electron-builder \
    --config "$CONFIG_FILE" \
    --mac dmg \
    --universal \
    --publish never \
    "--config.extraMetadata.version=$VERSION"
)

GENERATED_DMG="$OUTPUT_ROOT/admin-ingest-$VERSION-universal.dmg"
[[ -f "$GENERATED_DMG" ]] || fail "DMG_NOT_FOUND"

APP_BUNDLE="$(find "$OUTPUT_ROOT" -maxdepth 3 -type d -name '小董AI.app' -print -quit)"
[[ -n "$APP_BUNDLE" && -d "$APP_BUNDLE" ]] || fail "APP_BUNDLE_NOT_FOUND"

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
spctl --assess --type execute --verbose=2 "$APP_BUNDLE"
xcrun stapler validate "$APP_BUNDLE"
hdiutil verify "$GENERATED_DMG"
xcrun notarytool submit "$GENERATED_DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
xcrun stapler staple "$GENERATED_DMG"
xcrun stapler validate "$GENERATED_DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$GENERATED_DMG"

cp "$GENERATED_DMG" "$FINAL_DMG"
node "$ROOT/scripts/build/write-admin-ingest-apple-manifest.mjs" \
  --platform macos \
  --artifact "$FINAL_DMG" \
  --installer-type dmg \
  --product-name "小董AI"

echo "ADMIN_INGEST_MACOS_BUILD_OK=true"
echo "ADMIN_INGEST_MACOS_PATH=$FINAL_DMG"
echo "ADMIN_INGEST_MACOS_VERSION=$VERSION"
echo "ADMIN_INGEST_MACOS_BUILD=$BUILD_NUMBER"
echo "ADMIN_INGEST_MACOS_HEAD=$RELEASE_HEAD"

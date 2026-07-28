import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  ADMIN_INGEST_PLATFORMS,
  ADMIN_INGEST_SYNC_TARGET
} from "../lib/enterprise/admin-ingest-app-config";
import {
  getAdminIngestPlatformLabel,
  normalizeAdminIngestPlatform,
  resolveAdminIngestPlatformContext
} from "../lib/enterprise/admin-ingest-platform";
import { isAdminIngestApplePlatform } from "../lib/enterprise/admin-ingest-apple-voice";

const read = (path: string) => readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json"));
const capacitorConfig = read("capacitor.admin-ingest.ios.config.ts");
const appleVoice = read("lib/enterprise/admin-ingest-apple-voice.ts");
const modeToggle = read("components/enterprise-admin/IngestModeToggle.tsx");
const electronMain = read("electron/admin-ingest/main.js");
const macConfig = read("electron/admin-ingest/electron-builder.macos.yml");
const macEntitlements = read("electron/admin-ingest/entitlements.macos.plist");
const iosBuild = read("scripts/build/build-admin-ingest-ios.sh");
const macBuild = read("scripts/build/build-admin-ingest-macos.sh");
const workflow = read(".github/workflows/admin-ingest-build-apple.yml");

assert.deepEqual(ADMIN_INGEST_SYNC_TARGET, ["web", "exe", "apk"]);
assert.deepEqual(ADMIN_INGEST_PLATFORMS, ["web", "exe", "apk", "ios", "macos"]);
assert.equal(normalizeAdminIngestPlatform("ios"), "ios");
assert.equal(normalizeAdminIngestPlatform("macos"), "macos");
assert.equal(normalizeAdminIngestPlatform("iphone"), null);
assert.equal(getAdminIngestPlatformLabel("ios"), "iOS");
assert.equal(getAdminIngestPlatformLabel("macos"), "macOS");
assert.equal(isAdminIngestApplePlatform("ios"), true);
assert.equal(isAdminIngestApplePlatform("macos"), true);
assert.equal(isAdminIngestApplePlatform("apk"), false);
assert.equal(
  resolveAdminIngestPlatformContext({
    search: "?app=ingest-admin&platform=ios",
    userAgent: "Mozilla/5.0"
  }).platform,
  "ios"
);
assert.equal(
  resolveAdminIngestPlatformContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
  }).platform,
  "ios"
);
assert.equal(
  resolveAdminIngestPlatformContext({
    userAgent: "Mozilla/5.0 (Macintosh) Electron/42.3.3 Admin-Ingest-macOS"
  }).platform,
  "macos"
);

assert.match(capacitorConfig, /appId: "com\.aiknowledge\.ingestadmin"/);
assert.match(capacitorConfig, /appName: "小董AI"/);
assert.match(capacitorConfig, /path: "ios-admin-ingest"/);
assert.match(capacitorConfig, /platform", "ios"/);
assert.match(capacitorConfig, /cleartext: false/);
assert.match(capacitorConfig, /protocol !== "https:"/);
assert.match(capacitorConfig, /pathname\.startsWith\("\/admin-ingest"\)/);
assert.doesNotMatch(capacitorConfig, /47\.238\.0\.23|\/ingest(?:\?|")/);

assert.match(appleVoice, /new MediaRecorder/);
assert.match(appleVoice, /audioBitsPerSecond: 48_000/);
assert.match(appleVoice, /state: "audio"/);
assert.match(appleVoice, /state: "cancelled"/);
assert.match(appleVoice, /maxDurationMs = 45_000/);
assert.match(modeToggle, /isAdminIngestApplePlatform\(platformContext\.platform\)/);
assert.match(modeToggle, /startAdminIngestAppleVoiceRecording/);
assert.match(modeToggle, /eventName: ADMIN_INGEST_NATIVE_SPEECH_EVENT/);
assert.ok(
  modeToggle.indexOf("isAdminIngestApplePlatform(platformContext.platform)")
    < modeToggle.indexOf("if (!window.isSecureContext)"),
  "Apple MediaRecorder must be selected before the generic Web speech path."
);

assert.match(macConfig, /appId: com\.aiknowledge\.ingestadmin\.desktop/);
assert.match(macConfig, /productName: 小董AI/);
assert.match(macConfig, /electron\/admin-ingest\/\*\*/);
assert.match(macConfig, /arch:\s*\n\s*- universal/);
assert.match(macConfig, /hardenedRuntime: true/);
assert.match(macConfig, /notarize: true/);
assert.match(macConfig, /NSMicrophoneUsageDescription/);
assert.doesNotMatch(macConfig, /electron-admin|AI知识库管理后台/);
assert.match(macEntitlements, /com\.apple\.security\.cs\.allow-jit/);
assert.match(macEntitlements, /com\.apple\.security\.device\.audio-input/);

assert.match(electronMain, /BUILD_METADATA\.platform/);
assert.match(electronMain, /BUILD_METADATA\.webUrl/);
assert.match(electronMain, /return "小董AI\.dmg"/);
assert.match(electronMain, /return "小董AI\.exe"/);
assert.match(electronMain, /askForMediaAccess\("microphone"\)/);

for (const buildScript of [iosBuild, macBuild]) {
  assert.match(buildScript, /Darwin/);
  assert.match(buildScript, /ADMIN_INGEST_APP_URL_REQUIRED/);
  assert.match(buildScript, /protocol !== "https:"/);
  assert.match(buildScript, /RELEASE_WORKTREE_NOT_CLEAN/);
  assert.doesNotMatch(buildScript, /touch .*?\.(?:ipa|dmg)/);
}
assert.match(iosBuild, /XCODE_26_OR_NEWER_REQUIRED/);
assert.match(iosBuild, /xcodebuild[\s\S]*-exportArchive/);
assert.match(iosBuild, /codesign --verify --deep --strict/);
assert.match(macBuild, /Developer ID Application/);
assert.match(macBuild, /codesign --verify --deep --strict/);
assert.match(macBuild, /xcrun notarytool submit/);
assert.match(macBuild, /xcrun stapler staple/);
assert.match(macBuild, /xcrun stapler validate/);
assert.match(macBuild, /spctl --assess/);
assert.match(macBuild, /hdiutil verify/);

assert.match(workflow, /runs-on: macos-26/g);
assert.match(workflow, /ADMIN_INGEST_IOS_DISTRIBUTION_P12_BASE64/);
assert.match(workflow, /ADMIN_INGEST_MAC_DEVELOPER_ID_P12_BASE64/);
assert.match(workflow, /APPLE_NOTARY_APP_SPECIFIC_PASSWORD/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.doesNotMatch(workflow, /push:\s*\n|release:\s*\n/);

assert.equal(
  packageJson.scripts["admin-ingest:ios"],
  "node scripts/run-admin-ingest-apple-packaging.cjs ios"
);
assert.equal(
  packageJson.scripts["admin-ingest:macos"],
  "node scripts/run-admin-ingest-apple-packaging.cjs macos"
);

const appleSpecificSources = [
  capacitorConfig,
  appleVoice,
  macConfig,
  iosBuild,
  macBuild,
  workflow
].join("\n");
assert.doesNotMatch(appleSpecificSources, /deepseek|doubao/i);
assert.doesNotMatch(appleSpecificSources, /super-admin|superadmin|chat-ui|app=user/i);

if (process.platform !== "darwin") {
  for (const target of ["ios", "macos"]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-admin-ingest-apple-packaging.cjs", target],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires macOS/);
  }
}

console.log("admin-ingest Apple packaging tests passed");

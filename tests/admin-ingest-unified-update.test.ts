import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkAppUpdate, normalizeLatestReleaseManifest } from "../lib/app-update";
import {
  isAdminIngestUpdateSurface,
  promoteUnappliedWebReleaseUpdate
} from "../components/AppUpdateNotice";
import { checkCurrentAppUpdate } from "../lib/update-checker";
import releaseInfo from "../public/releases/latest.json";
import adminRelease from "../config/admin-ingest/release.json";

async function main() {
const normalized = normalizeLatestReleaseManifest(releaseInfo);
assert.ok(normalized);

const admin = normalized.admin;
assert.equal(admin.version, adminRelease.version);
assert.equal(admin.build, adminRelease.build);
assert.equal(admin.minimum_build, adminRelease.minimum_build);
assert.equal(admin.force_update, true);
assert.equal(admin.web_url, adminRelease.web_url);
assert.equal(admin.apk_url, adminRelease.apk_url);
assert.equal(admin.exe_url, adminRelease.exe_url);

const manifestFetch = (async () => ({
  ok: true,
  json: async () => releaseInfo
} as Response)) as unknown as typeof fetch;

const stalePackage = await checkAppUpdate({
  appKind: "admin",
  currentVersion: "1.0.10",
  currentBuild: 110,
  currentWebReleaseSha: admin.web_release_sha,
  fetcher: manifestFetch
});
assert.equal(stalePackage.hasUpdate, true);
assert.equal(stalePackage.updateKind, "package");
assert.equal(stalePackage.forceUpdate, true);

const staleNativeWithOlderWeb = await checkCurrentAppUpdate({
  appKind: "admin",
  currentVersion: "1.0.10",
  currentBuild: 110,
  currentWebReleaseSha: "older-admin-web-sha",
  runtimeWindow: {
    location: { search: "" },
    navigator: { userAgent: "Mozilla/5.0 Electron/42.3.3" },
    aiKnowledge: {
      appVersion: "1.0.10",
      appBuild: 110,
      webReleaseSha: "older-admin-web-sha"
    }
  },
  fetcher: manifestFetch
});
assert.equal(staleNativeWithOlderWeb.updateKind, "package");
assert.equal(staleNativeWithOlderWeb.forceUpdate, true);

const storageValues = new Map<string, string>();
const storage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => storageValues.set(key, value)
};
const forcedWeb = promoteUnappliedWebReleaseUpdate({
  appKind: "admin",
  currentVersion: admin.version,
  currentBuild: admin.build,
  currentWebReleaseSha: admin.web_release_sha,
  hasUpdate: false,
  forceUpdate: false,
  updateKind: "none",
  latest: admin,
  updatedAt: releaseInfo.updated_at
}, "admin", storage);
assert.equal(forcedWeb.hasUpdate, true);
assert.equal(forcedWeb.updateKind, "web");
assert.equal(forcedWeb.forceUpdate, true);
assert.equal(isAdminIngestUpdateSurface("/admin-ingest", ""), true);
assert.equal(isAdminIngestUpdateSurface("/ingest/login", ""), true);
assert.equal(isAdminIngestUpdateSurface("/login", "?app=ingest-admin"), true);
assert.equal(isAdminIngestUpdateSurface("/super-admin", ""), false);

const frozenSuperAdminWeb = promoteUnappliedWebReleaseUpdate({
  appKind: "admin",
  currentVersion: admin.version,
  currentBuild: admin.build,
  currentWebReleaseSha: admin.web_release_sha,
  hasUpdate: false,
  forceUpdate: false,
  updateKind: "none",
  latest: admin,
  updatedAt: releaseInfo.updated_at
}, "admin", storage, false);
assert.equal(frozenSuperAdminWeb.hasUpdate, false);
assert.equal(frozenSuperAdminWeb.updateKind, "none");

const user = normalized.user;
const userWeb = promoteUnappliedWebReleaseUpdate({
  appKind: "user",
  currentVersion: user.version,
  currentBuild: user.build,
  currentWebReleaseSha: user.web_release_sha,
  hasUpdate: false,
  forceUpdate: false,
  updateKind: "none",
  latest: user,
  updatedAt: releaseInfo.updated_at
}, "user", storage);
assert.equal(userWeb.hasUpdate, true);
assert.equal(userWeb.forceUpdate, false);

const updateNotice = readFileSync("components/AppUpdateNotice.tsx", "utf8");
assert.match(updateNotice, /forceUpdate:\s*appKind === ADMIN_APP_KIND/);
assert.doesNotMatch(updateNotice, /if \(appKind !== "user"\)\s*\{\s*openLink/);
assert.match(
  updateNotice,
  /appKind === ADMIN_APP_KIND && platform === "electron" && openLink\(targetUrl\)/
);
assert.match(updateNotice, /旧版安装包下载已打开/);

const electronMain = readFileSync("electron/admin-ingest/main.js", "utf8");
const electronPreload = readFileSync("electron/admin-ingest/preload.js", "utf8");
assert.match(electronMain, /ipcMain\.handle\("admin-ingest:download-update"/);
assert.match(electronMain, /isTrustedAdminSender/);
assert.match(electronMain, /shellVersion/);
assert.match(electronMain, /shellBuild/);
assert.match(electronMain, /shellWebReleaseSha/);
assert.match(electronMain, /preload:\s*path\.join\(__dirname,\s*"preload\.js"\)/);
assert.match(electronPreload, /contextBridge\.exposeInMainWorld\("aiKnowledge"/);
assert.match(electronPreload, /downloadAndInstallUpdate/);
assert.match(electronPreload, /onUpdateDownloadProgress/);

const capacitorConfig = readFileSync("capacitor.admin.config.ts", "utf8");
assert.match(capacitorConfig, /shellVersion/);
assert.match(capacitorConfig, /shellBuild/);
assert.match(capacitorConfig, /shellWebReleaseSha/);

const apkBuild = readFileSync("scripts/build-admin-android-apk.ps1", "utf8");
assert.match(apkBuild, /assembleRelease/);
assert.match(apkBuild, /app\/build\/outputs\/apk\/release\/app-release\.apk/);
assert.match(apkBuild, /ANDROID_RELEASE_KEYSTORE_PATH/);
assert.match(apkBuild, /android\.injected\.signing\.store\.file/);

for (const buildScriptPath of [
  "scripts/build/build-admin-ingest-exe.ps1",
  "scripts/build/build-admin-ingest-apk.ps1",
  "scripts/build/build-admin-ingest-web.ps1"
]) {
  const buildScript = readFileSync(buildScriptPath, "utf8");
  assert.match(buildScript, /git status --porcelain --untracked-files=all/);
  assert.match(buildScript, /RELEASE_WORKTREE_NOT_CLEAN/);
}

const releaseWorkflow = readFileSync(".github/workflows/admin-ingest-release.yml", "utf8");
assert.match(releaseWorkflow, /build-apk:[\s\S]*strict:\s*true/);
assert.match(releaseWorkflow, /build-exe:[\s\S]*strict:\s*true/);
assert.doesNotMatch(releaseWorkflow, /Download APK artifacts[\s\S]{0,120}continue-on-error:\s*true/);
assert.doesNotMatch(releaseWorkflow, /Download EXE artifacts[\s\S]{0,120}continue-on-error:\s*true/);

const apkWorkflow = readFileSync(".github/workflows/admin-ingest-build-apk.yml", "utf8");
assert.match(apkWorkflow, /ANDROID_RELEASE_KEYSTORE_BASE64/);
assert.match(apkWorkflow, /apksigner[\s\S]*verify --verbose --print-certs/);

const syncVerifier = readFileSync("scripts/ci/verify-web-apk-exe-sync.mjs", "utf8");
assert.match(syncVerifier, /requireArtifact\("apk"/);
assert.match(syncVerifier, /requireArtifact\("exe"/);
assert.match(syncVerifier, /available must be true/);
assert.match(syncVerifier, /package hash and size are required/);

const releaseResolver = JSON.parse(execFileSync(
  process.execPath,
  ["scripts/release/resolve-version.mjs", "--environment", "prod"],
  { encoding: "utf8" }
));
assert.equal(releaseResolver.version, adminRelease.version);
assert.equal(Number(releaseResolver.buildNumber), adminRelease.build);
assert.equal(releaseResolver.tag, adminRelease.release_tag);
assert.equal(releaseResolver.webUrl, adminRelease.web_url);
assert.equal(releaseResolver.latestApkUrl, adminRelease.apk_url);
assert.equal(releaseResolver.latestExeUrl, adminRelease.exe_url);

const deployWorkflow = readFileSync(".github/workflows/admin-ingest-deploy-web.yml", "utf8");
assert.match(deployWorkflow, /name:\s*admin-ingest-deploy-web-manifest/);
assert.match(deployWorkflow, /releaseVerified:[\s\S]{0,160}required:\s*true/);
assert.match(
  deployWorkflow,
  /inputs\.environment != 'prod' \|\| inputs\.releaseVerified == true/
);
assert.match(
  deployWorkflow,
  /ADMIN_INGEST_RELEASE_BUILD=1[\s\S]{0,120}ADMIN_WEB_RELEASE_SHA="\$RELEASE_SHA"[\s\S]{0,120}npm run build/
);
assert.doesNotMatch(deployWorkflow, /name:\s*admin-ingest-web-manifest/);
assert.match(releaseWorkflow, /deploy-web:[\s\S]*releaseVerified:\s*true/);

console.log("Admin-ingest unified Web/EXE/APK update tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

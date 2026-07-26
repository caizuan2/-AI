import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import latestRelease from "../public/releases/latest.json";
import adminRelease from "../config/admin-ingest/release.json";

const directApkUrl = "http://47.238.0.23/admin-installers/admin-ingest.apk";

assert.equal(adminRelease.apk_url, directApkUrl);
assert.equal(latestRelease.admin.apk_url, directApkUrl);
assert.equal(latestRelease.apps.admin.versions[0]?.apk_url, directApkUrl);

assert.match(
  latestRelease.user.apk_url,
  /^https:\/\/github\.com\/caizuan2\/-AI\/releases\/download\//
);
assert.notEqual(latestRelease.user.apk_url, directApkUrl);

const mainActivity = readFileSync(
  "android/app/src/main/java/com/aiknowledge/chat/MainActivity.java",
  "utf8"
);
assert.match(mainActivity, /ADMIN_UPDATE_STALL_TIMEOUT_MS\s*=\s*45_000L/);
assert.match(mainActivity, /SystemClock\.elapsedRealtime\(\)/);
assert.match(mainActivity, /manager\.remove\(updateDownloadId\)/);
assert.match(mainActivity, /APK 下载长时间没有进度/);
assert.match(mainActivity, /正在连接阿里云下载服务器/);
assert.match(mainActivity, /postUpdateProgress\("downloading", 0, message, null, true\)/);
assert.match(mainActivity, /isAdminShell\(\) && total <= 0L/);
assert.match(mainActivity, /isAdminShell\(\) && !isValidAdminUpdateApk\(apkFile\)/);
assert.match(mainActivity, /getPackageArchiveInfo/);
assert.match(mainActivity, /getPackageName\(\)\.equals\(packageInfo\.packageName\)/);

const adminUnknownTotalBlock = mainActivity.slice(
  mainActivity.indexOf("if (isAdminShell() && total <= 0L)"),
  mainActivity.indexOf("postUpdateProgress(\"downloading\", progress")
);
assert.doesNotMatch(adminUnknownTotalBlock, /25/);
assert.match(adminUnknownTotalBlock, /indeterminate|true/);

const appUpdateNotice = readFileSync("components/AppUpdateNotice.tsx", "utf8");
assert.match(appUpdateNotice, /indeterminate\?: boolean/);
assert.match(appUpdateNotice, /indeterminate:\s*detail\.indeterminate/);
assert.match(appUpdateNotice, /appKind === ADMIN_APP_KIND \? 0 : 15/);

const updateModal = readFileSync("components/UpdateModal.tsx", "utf8");
assert.match(updateModal, /installIndeterminate/);
assert.match(updateModal, /"连接中"/);
assert.match(updateModal, /animate-pulse/);

const releaseWorkflow = readFileSync(
  ".github/workflows/admin-ingest-release.yml",
  "utf8"
);
assert.match(releaseWorkflow, /Publish verified APK to Aliyun direct-download storage/);
assert.match(releaseWorkflow, /sha256sum "\$apk"/);
assert.match(releaseWorkflow, /\/admin-ingest\/releases\/current/);

const deployWorkflow = readFileSync(
  ".github/workflows/admin-ingest-deploy-web.yml",
  "utf8"
);
assert.match(deployWorkflow, /public\/admin-installers/);
assert.match(deployWorkflow, /ln -sfn/);
assert.match(deployWorkflow, /admin-installers\/admin-ingest\.apk/);
assert.match(deployWorkflow, /"206"/);

console.log("Admin-ingest APK direct-download and stall recovery tests passed.");

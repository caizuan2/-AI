import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canDismissUpdate,
  checkAppUpdate,
  detectAppPlatform,
  normalizeLatestReleaseManifest,
  resolveUpdateTarget,
  resolveUpdateUrl,
  shouldSkipUpdateNotice,
  snoozeUpdateNotice,
  type LatestReleaseManifest
} from "../lib/app-update";
import { detectPlatform, openLink, resolveDownload } from "../lib/update-core";
import { normalizeAppStoreManifest } from "../lib/app-store";
import { AppUpdateNoticeDialog } from "../components/AppUpdateNotice";
import { APP_BUILD, APP_VERSION } from "../lib/app-version";
import releaseInfo from "../public/releases/latest.json";

const parsedManifest = normalizeLatestReleaseManifest(releaseInfo);
const appStoreManifest = normalizeAppStoreManifest(releaseInfo);

assert.ok(parsedManifest, "latest.json should match the user/admin release manifest shape.");
assert.ok(appStoreManifest, "latest.json should expose the App Store apps catalog.");
const manifest: LatestReleaseManifest = parsedManifest;
assert.ok(appStoreManifest.apps.user);
assert.ok(appStoreManifest.apps.admin);
assert.equal(appStoreManifest.apps.user.active_version, APP_VERSION);
assert.equal(appStoreManifest.apps.admin.active_version, APP_VERSION);
assert.ok(manifest.user.app_name.trim().length > 0);
assert.ok(manifest.admin.app_name.trim().length > 0);
assert.equal(typeof manifest.user.build, "number");
assert.equal(typeof manifest.admin.build, "number");
assert.equal(APP_VERSION, "1.0.3");
assert.equal(APP_BUILD, 103);
assert.equal(manifest.user.build, APP_BUILD);
assert.equal(manifest.admin.build, APP_BUILD);
assert.match(manifest.user.apk_url, /\/downloads\/ai-knowledge-chat-latest\.apk$/);
assert.match(manifest.admin.apk_url, /\/downloads\/admin\/ai-knowledge-admin-latest\.apk$/);
assert.match(manifest.user.exe_url, /github\.com\/caizuan2\/-AI\/releases\/download\/v1\.0\.1-user-windows/);
assert.match(manifest.admin.exe_url, /github\.com\/caizuan2\/-AI\/releases\/download\/v1\.0\.0-admin-windows/);
assert.doesNotMatch(JSON.stringify(manifest), /\.(ipa|dmg)"/i);

function createFetch(manifestBody: LatestReleaseManifest): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => manifestBody
  } as Response)) as unknown as typeof fetch;
}

async function main() {
  const userUpdate = await checkAppUpdate({
    appKind: "user",
    currentVersion: "1.0.1",
    currentBuild: manifest.user.build - 1,
    fetcher: createFetch(manifest)
  });

  assert.equal(userUpdate.hasUpdate, true);
  assert.equal(userUpdate.forceUpdate, false);
  assert.equal(userUpdate.latest?.version, manifest.user.version);

  const currentUserUpdate = await checkAppUpdate({
    appKind: "user",
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
    fetcher: createFetch(manifest)
  });

  assert.equal(currentUserUpdate.hasUpdate, false);
  assert.equal(currentUserUpdate.forceUpdate, false);

  const equalBuildForceManifest: LatestReleaseManifest = {
    ...manifest,
    user: {
      ...manifest.user,
      force_update: true
    }
  };
  const equalBuildForceUpdate = await checkAppUpdate({
    appKind: "user",
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
    fetcher: createFetch(equalBuildForceManifest)
  });

  assert.equal(equalBuildForceUpdate.hasUpdate, false);
  assert.equal(equalBuildForceUpdate.forceUpdate, false);

  const forceManifest: LatestReleaseManifest = {
    ...manifest,
    user: {
      ...manifest.user,
      force_update: true
    }
  };
  const forceUpdate = await checkAppUpdate({
    appKind: "user",
    currentVersion: "1.0.1",
    currentBuild: forceManifest.user.minimum_build - 1,
    fetcher: createFetch(forceManifest)
  });

  assert.equal(forceUpdate.hasUpdate, true);
  assert.equal(forceUpdate.forceUpdate, true);
  assert.equal(canDismissUpdate(forceUpdate), false);

  assert.equal(resolveUpdateUrl(manifest.user, "android"), manifest.user.apk_url);
  assert.equal(resolveUpdateUrl(manifest.user, "windows"), manifest.user.exe_url);
  assert.equal(resolveUpdateUrl(manifest.user, "ios"), manifest.user.download_page);
  assert.equal(resolveUpdateUrl(manifest.user, "macos"), manifest.user.download_page);
  assert.equal(resolveUpdateUrl(manifest.user, "web"), manifest.user.web_url);
  assert.equal(resolveUpdateUrl(manifest.user, "electron"), manifest.user.exe_url);
  assert.equal(resolveUpdateUrl(manifest.user, "unknown"), manifest.user.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "android"), manifest.admin.apk_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "windows"), manifest.admin.exe_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "ios"), manifest.admin.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "macos"), manifest.admin.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "web"), manifest.admin.web_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "electron"), manifest.admin.exe_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "unknown"), manifest.admin.download_page);
  assert.equal(resolveUpdateUrl({ ...manifest.user, apk_url: "" }, "android"), manifest.user.download_page);

  assert.equal(resolveUpdateTarget(manifest.user, "user", "android").url, manifest.user.apk_url);
  assert.equal(resolveUpdateTarget(manifest.admin, "admin", "android").url, manifest.admin.apk_url);
  assert.equal(resolveUpdateTarget(manifest.user, "user", "windows").url, manifest.user.exe_url);
  assert.equal(resolveUpdateTarget(manifest.admin, "admin", "windows").url, manifest.admin.exe_url);
  assert.equal(resolveUpdateTarget(manifest.user, "user", "web").url, manifest.user.web_url);
  assert.equal(resolveUpdateTarget(manifest.admin, "admin", "web").url, manifest.admin.web_url);
  assert.equal(resolveUpdateTarget(manifest.user, "user", "unknown").url, manifest.user.download_page);
  assert.equal(resolveUpdateTarget({ ...manifest.user, apk_url: "" }, "user", "android").url, manifest.user.download_page);
  assert.match(resolveUpdateTarget(manifest.admin, "admin", "windows").label, /Admin Windows EXE/);
  assert.equal(resolveDownload(manifest.user, "user", "android").url, manifest.user.apk_url);
  assert.equal(resolveDownload(manifest.admin, "admin", "windows").url, manifest.admin.exe_url);

  assert.equal(detectAppPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"), "android");
  assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"), "android");
  assert.equal(detectPlatform({ userAgent: "", capacitor: { getPlatform: () => "android" } }), "android");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36"), "android");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0) Electron/42.0.0"), "electron");
  assert.equal(detectAppPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"), "ios");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"), "macos");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"), "web");
  assert.equal(detectAppPlatform(""), "unknown");

  const userDialogMarkup = renderToStaticMarkup(
    React.createElement(AppUpdateNoticeDialog, {
      appKind: "user",
      update: {
        appKind: "user",
        currentVersion: "1.0.1",
        currentBuild: manifest.user.build - 1,
        hasUpdate: true,
        forceUpdate: false,
        latest: manifest.user,
        updatedAt: manifest.updated_at
      },
      updateUrl: manifest.user.apk_url,
      platform: "android",
      dismissible: true,
      onUpdateNow: () => undefined,
      onSnooze: () => undefined
    })
  );

  assert.match(userDialogMarkup, /发现新版本/);
  assert.match(userDialogMarkup, new RegExp(manifest.user.app_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(userDialogMarkup, /当前版本：1\.0\.1/);
  assert.match(userDialogMarkup, new RegExp(`最新版本：${manifest.user.version}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const item of manifest.user.changelog) {
    assert.match(userDialogMarkup, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(userDialogMarkup, /h-14 min-h-14/);
  assert.match(userDialogMarkup, /text-base font-bold/);
  assert.match(userDialogMarkup, /aria-label="立即更新/);
  assert.match(userDialogMarkup, /当前版本：1\.0\.1/);
  assert.match(userDialogMarkup, new RegExp(manifest.user.apk_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(userDialogMarkup, /稍后提醒/);
  assert.doesNotMatch(userDialogMarkup, /<a[^>]*\sdisabled(?:=|\s|>)/);

  const androidBridgeCalls: string[] = [];
  assert.equal(openLink(manifest.user.apk_url, {
    AndroidBridge: {
      openUrl: (url) => {
        androidBridgeCalls.push(url);
      }
    },
    open: () => {
      throw new Error("window.open should not run when AndroidBridge exists");
    },
    location: { href: "" }
  }), true);
  assert.deepEqual(androidBridgeCalls, [manifest.user.apk_url]);

  const openCalls: string[][] = [];
  const openedWindow: { opener?: unknown } = {};
  assert.equal(openLink(manifest.user.apk_url, {
    open: (url, target) => {
      openCalls.push([url, target]);
      return openedWindow;
    },
    location: { href: "" }
  }), true);
  assert.deepEqual(openCalls, [[manifest.user.apk_url, "_blank"]]);
  assert.equal(openedWindow.opener, null);

  const electronExternalCalls: string[] = [];
  assert.equal(openLink(manifest.user.exe_url, {
    electron: {
      shell: {
        openExternal: (url) => {
          electronExternalCalls.push(url);
        }
      }
    },
    open: () => {
      throw new Error("window.open should not run when shell.openExternal exists");
    },
    location: { href: "" }
  }), true);
  assert.deepEqual(electronExternalCalls, [manifest.user.exe_url]);

  const fallbackLocation = { href: "" };
  assert.equal(openLink(manifest.admin.exe_url, {
    open: () => null,
    location: fallbackLocation
  }), true);
  assert.equal(fallbackLocation.href, manifest.admin.exe_url);

  const blockedLocation = { href: "" };
  assert.equal(openLink(manifest.user.web_url, {
    open: () => {
      throw new Error("window.open blocked");
    },
    location: blockedLocation
  }), true);
  assert.equal(blockedLocation.href, manifest.user.web_url);

  let assignedUrl = "";
  let hrefFallbackUrl = "";
  const assignFirstLocation = {
    get href() {
      return "";
    },
    set href(value: string) {
      hrefFallbackUrl = value;
    },
    assign: (url: string) => {
      assignedUrl = url;
    }
  };
  assert.equal(openLink(manifest.admin.apk_url, {
    open: () => null,
    location: assignFirstLocation
  }), true);
  assert.equal(assignedUrl, manifest.admin.apk_url);
  assert.equal(hrefFallbackUrl, "");

  const hrefAfterAssignFailureLocation = {
    href: "",
    assign: () => {
      throw new Error("assign blocked");
    }
  };
  assert.equal(openLink(manifest.admin.download_page, {
    open: () => null,
    location: hrefAfterAssignFailureLocation
  }), true);
  assert.equal(hrefAfterAssignFailureLocation.href, manifest.admin.download_page);
  assert.equal(openLink(""), false);

  const adminForceDialogMarkup = renderToStaticMarkup(
    React.createElement(AppUpdateNoticeDialog, {
      appKind: "admin",
      update: {
        appKind: "admin",
        currentVersion: "1.0.1",
        currentBuild: manifest.admin.minimum_build - 1,
        hasUpdate: true,
        forceUpdate: true,
        latest: manifest.admin,
        updatedAt: manifest.updated_at
      },
      updateUrl: manifest.admin.exe_url,
      platform: "windows",
      dismissible: false,
      onUpdateNow: () => undefined,
      onSnooze: () => undefined
    })
  );

  assert.match(adminForceDialogMarkup, new RegExp(manifest.admin.app_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(adminForceDialogMarkup, new RegExp(manifest.admin.exe_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(adminForceDialogMarkup, />稍后提醒</);

  const storage = new Map<string, string>();
  const storageAdapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  };
  assert.equal(shouldSkipUpdateNotice("user", manifest.user.build, storageAdapter, 1000), false);
  snoozeUpdateNotice("user", manifest.user.build, storageAdapter, 1000);
  assert.equal(shouldSkipUpdateNotice("user", manifest.user.build, storageAdapter, 1001), true);

  const appUpdateNotice = readFileSync("components/AppUpdateNotice.tsx", "utf8");
  assert.match(appUpdateNotice, /localStorage\.removeItem\("force_update"\)/);
  assert.match(appUpdateNotice, /sessionStorage\.removeItem\("force_update"\)/);

  const releaseScriptPath = "scripts/release-all-installers.ps1";
  assert.ok(existsSync(releaseScriptPath), "release-all-installers.ps1 should exist.");
  const releaseScript = readFileSync(releaseScriptPath, "utf8");
  assert.match(releaseScript, /npm" -Arguments @\("run", "app:android"\)/);
  assert.match(releaseScript, /npm" -Arguments @\("run", "admin:android"\)/);
  assert.match(releaseScript, /npm" -Arguments @\("run", "app:windows"\)/);
  assert.match(releaseScript, /npm" -Arguments @\("run", "admin:windows"\)/);
  assert.match(releaseScript, /gh release upload/);
  assert.match(releaseScript, /public\/downloads|public\\downloads/);
  assert.doesNotMatch(releaseScript, /^\s*(?:&\s*)?git\s+(?:add|commit|push)\b/m);
  assert.doesNotMatch(releaseScript, /dist-app.*git add/i);

  for (const pagePath of [
    "public/user-download.html",
    "public/admin-download.html",
    "app/download/page.tsx",
    "app/admin-download/page.tsx"
  ]) {
    const page = readFileSync(pagePath, "utf8");
    assert.doesNotMatch(page, /href=["'][^"']+\.(?:ipa|dmg)(?:["'?])/i);
  }

  const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(prismaSchema, /app-update|latest\.json|release-all-installers/i);
  if (existsSync("prisma/migrations")) {
    const updateMigrations = readdirSync("prisma/migrations").filter((name) =>
      /app.*update|release|installer|latest/i.test(name)
    );
    assert.deepEqual(updateMigrations, []);
  }

  console.log("App update tests passed.");
}

void main();

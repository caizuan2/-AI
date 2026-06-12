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
import { AppUpdateNoticeDialog, openUpdateUrl } from "../components/AppUpdateNotice";
import releaseInfo from "../public/releases/latest.json";

const parsedManifest = normalizeLatestReleaseManifest(releaseInfo);

assert.ok(parsedManifest, "latest.json should match the user/admin release manifest shape.");
const manifest: LatestReleaseManifest = parsedManifest;
assert.ok(manifest.user.app_name.trim().length > 0);
assert.ok(manifest.admin.app_name.trim().length > 0);
assert.equal(typeof manifest.user.build, "number");
assert.equal(typeof manifest.admin.build, "number");
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
  assert.equal(resolveUpdateUrl(manifest.user, "unknown"), manifest.user.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "android"), manifest.admin.apk_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "windows"), manifest.admin.exe_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "ios"), manifest.admin.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "macos"), manifest.admin.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "web"), manifest.admin.web_url);
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

  assert.equal(detectAppPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"), "android");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36"), "android");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0) Electron/42.0.0"), "windows");
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
  assert.match(userDialogMarkup, new RegExp(manifest.user.apk_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(userDialogMarkup, /稍后提醒/);
  assert.doesNotMatch(userDialogMarkup, /<a[^>]*\sdisabled(?:=|\s|>)/);

  const openCalls: string[][] = [];
  const openedWindow: { opener?: unknown } = {};
  assert.equal(openUpdateUrl(manifest.user.apk_url, {
    open: (url, target, features) => {
      openCalls.push([url, target, features]);
      return openedWindow;
    },
    location: { href: "" }
  }), true);
  assert.deepEqual(openCalls, [[manifest.user.apk_url, "_blank", "noopener,noreferrer"]]);
  assert.equal(openedWindow.opener, null);

  const fallbackLocation = { href: "" };
  assert.equal(openUpdateUrl(manifest.admin.exe_url, {
    open: () => null,
    location: fallbackLocation
  }), true);
  assert.equal(fallbackLocation.href, manifest.admin.exe_url);

  const blockedLocation = { href: "" };
  assert.equal(openUpdateUrl(manifest.user.web_url, {
    open: () => {
      throw new Error("window.open blocked");
    },
    location: blockedLocation
  }), true);
  assert.equal(blockedLocation.href, manifest.user.web_url);
  assert.equal(openUpdateUrl(""), false);

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

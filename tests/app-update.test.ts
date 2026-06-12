import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  canDismissUpdate,
  checkAppUpdate,
  detectAppPlatform,
  normalizeLatestReleaseManifest,
  resolveUpdateUrl,
  shouldSkipUpdateNotice,
  snoozeUpdateNotice,
  type LatestReleaseManifest
} from "../lib/app-update";
import releaseInfo from "../public/releases/latest.json";

const parsedManifest = normalizeLatestReleaseManifest(releaseInfo);

assert.ok(parsedManifest, "latest.json should match the user/admin release manifest shape.");
const manifest: LatestReleaseManifest = parsedManifest;
assert.equal(manifest.user.app_name, "AI知识库助手");
assert.equal(manifest.admin.app_name, "AI知识库管理后台");
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
  assert.equal(resolveUpdateUrl(manifest.user, "unknown"), manifest.user.download_page);
  assert.equal(resolveUpdateUrl(manifest.admin, "android"), manifest.admin.apk_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "windows"), manifest.admin.exe_url);
  assert.equal(resolveUpdateUrl(manifest.admin, "unknown"), manifest.admin.download_page);

  assert.equal(detectAppPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"), "android");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0) Electron/42.0.0"), "windows");
  assert.equal(detectAppPlatform("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"), "web");
  assert.equal(detectAppPlatform(""), "unknown");

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

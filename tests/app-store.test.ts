import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  addVersion,
  appRegistry,
  buildAppCatalog,
  evaluateUpdatePolicy,
  getActiveVersion,
  getManifestAppReleaseSnapshot,
  getRegisteredApp,
  getUserBucket,
  getUserSegment,
  listRegisteredApps,
  listVersions,
  normalizeAppStoreManifest,
  registerApp,
  resolveDistributedDownload,
  resolveDistributedVersion,
  rollbackService,
  type AppStoreApplication,
  type AppStoreChannel,
  type AppStoreManifest,
  type AppStorePlatform,
  type AppStoreVersion
} from "../lib/app-store";
import { normalizeLatestReleaseManifest } from "../lib/app-update";
import latestRelease from "../public/releases/latest.json";
import versionInfo from "../version.json";

const userApkUrl = "https://cdn.example.com/user.apk";
const userExeUrl = "https://cdn.example.com/user.exe";
const userWebUrl = "https://example.com/chat-ui";
const downloadPage = "https://example.com/user-download.html";

function version(input: Partial<AppStoreVersion> & Pick<AppStoreVersion, "version" | "build" | "channel">): AppStoreVersion {
  return {
    rollout: 100,
    minimum_build: 100,
    force_update: false,
    web_url: userWebUrl,
    apk_url: userApkUrl,
    exe_url: userExeUrl,
    download_page: downloadPage,
    changelog: [],
    created_at: `2026-06-13T00:00:${input.build}.000Z`,
    ...input
  };
}

function findUserIdForSegment(segment: AppStoreChannel) {
  for (let index = 0; index < 2000; index += 1) {
    const userId = `${segment}-tester-${index}`;

    if (getUserSegment(userId) === segment) {
      return userId;
    }
  }

  throw new Error(`Unable to find ${segment} test user.`);
}

const canaryUser = findUserIdForSegment("canary");
const betaUser = findUserIdForSegment("beta");
const stableUser = findUserIdForSegment("stable");

const testApp: AppStoreApplication = {
  id: "ai.chat.user",
  name: "AI知识库助手",
  platforms: ["android", "windows", "web", "electron"],
  active_version: "1.0.4-canary",
  versions: [
    version({ version: "1.0.4-canary", build: 104, channel: "canary", rollout: 10 }),
    version({ version: "1.0.4-beta", build: 104, channel: "beta", rollout: 50 }),
    version({ version: "1.0.3", build: 103, channel: "stable", rollout: 100 })
  ]
};

const testManifest: AppStoreManifest = {
  updated_at: "2026-06-13T00:00:00.000Z",
  apps: {
    user: testApp,
    admin: {
      ...testApp,
      id: "ai.chat.admin",
      name: "AI知识库管理后台",
      active_version: "1.0.3",
      versions: [version({ version: "1.0.3", build: 103, channel: "stable" })]
    }
  }
};

assert.equal(getUserSegment(canaryUser), "canary");
assert.equal(getUserSegment(betaUser), "beta");
assert.equal(getUserSegment(stableUser), "stable");
assert.equal(getUserBucket(canaryUser), getUserBucket(canaryUser));

const registeredApps = listRegisteredApps();
assert.ok(registeredApps.some((app) => app.key === "user" && app.id === "ai.chat.user"));
assert.ok(registeredApps.some((app) => app.key === "admin" && app.id === "ai.chat.admin"));
assert.deepEqual(getRegisteredApp("user")?.platforms, ["android", "windows", "ios", "macos", "web", "electron"]);
const futureRegistry = registerApp(appRegistry, {
  key: "future",
  id: "ai.chat.future",
  name: "Future App",
  platforms: ["web"]
});
assert.equal(futureRegistry.future.id, "ai.chat.future");

assert.equal(resolveDistributedVersion(testApp, { userId: canaryUser, platform: "android" }).version?.version, "1.0.4-canary");
assert.equal(resolveDistributedVersion(testApp, { userId: betaUser, platform: "android" }).version?.version, "1.0.4-beta");
assert.equal(resolveDistributedVersion(testApp, { userId: stableUser, platform: "android" }).version?.version, "1.0.3");
assert.equal(resolveDistributedVersion(testApp, { userId: canaryUser, platform: "windows" }).version?.version, "1.0.3");
assert.equal(resolveDistributedVersion(testApp, { userId: betaUser, platform: "web" }).version?.version, "1.0.3");

const canaryAgain = resolveDistributedVersion(testApp, { userId: canaryUser, platform: "android" });
assert.equal(canaryAgain.bucket, getUserBucket(canaryUser));
assert.equal(canaryAgain.segment, "canary");

const rolledBack = rollbackService.rollbackToVersion(testManifest, "user", "1.0.3", "2026-06-13T01:00:00.000Z");
assert.equal(rolledBack.apps.user.active_version, "1.0.3");
assert.equal(rolledBack.updated_at, "2026-06-13T01:00:00.000Z");
assert.equal(testManifest.apps.user.active_version, "1.0.4-canary");
assert.equal(rollbackService.rollbackToBuild(testManifest, "user", 103).apps.user.active_version, "1.0.3");
assert.throws(() => rollbackService.rollbackToVersion(testManifest, "user", "9.9.9"));

const forcePolicy = evaluateUpdatePolicy({
  currentBuild: 99,
  release: version({ version: "1.0.3", build: 103, channel: "stable", minimum_build: 100 })
});
assert.deepEqual(forcePolicy, {
  hasUpdate: true,
  forceUpdate: true,
  reason: "minimum_build"
});
assert.equal(evaluateUpdatePolicy({
  currentBuild: 103,
  release: version({ version: "1.0.3", build: 103, channel: "stable", force_update: true })
}).forceUpdate, false);

const androidDownload = resolveDistributedDownload(testApp, { userId: canaryUser, platform: "android" });
const windowsDownload = resolveDistributedDownload(testApp, { userId: canaryUser, platform: "windows" });
const webDownload = resolveDistributedDownload(testApp, { userId: canaryUser, platform: "web" });
const electronDownload = resolveDistributedDownload(testApp, { userId: canaryUser, platform: "electron" });
assert.equal(androidDownload?.url, userApkUrl);
assert.equal(windowsDownload?.url, userExeUrl);
assert.equal(webDownload?.url, userWebUrl);
assert.equal(electronDownload?.url, userExeUrl);

const active = getActiveVersion(testApp);
assert.equal(active?.version, "1.0.4-canary");
assert.equal(listVersions(testApp)[0].build, 104);
const catalogWithDraft = addVersion(testApp, version({ version: "1.0.5", build: 105, channel: "stable" }));
assert.equal(catalogWithDraft.active_version, "1.0.5");
assert.equal(getActiveVersion(catalogWithDraft)?.build, 105);
const rebuiltCatalog = buildAppCatalog(appRegistry.user, catalogWithDraft.versions, catalogWithDraft.active_version);
assert.equal(rebuiltCatalog.id, "ai.chat.user");

const normalizedLatest = normalizeAppStoreManifest(latestRelease);
assert.ok(normalizedLatest);
assert.ok(normalizedLatest.apps.user.versions.length >= 1);
assert.ok(normalizedLatest.apps.admin.versions.length >= 1);
assert.equal(normalizedLatest.apps.user.active_version, versionInfo.version);
assert.equal(normalizedLatest.apps.admin.active_version, latestRelease.admin.version);
assert.equal(getManifestAppReleaseSnapshot(normalizedLatest, "user")?.build, versionInfo.build);

const legacySnapshot = normalizeLatestReleaseManifest(latestRelease);
assert.ok(legacySnapshot);
assert.equal(legacySnapshot.user.build, versionInfo.build);
assert.equal(legacySnapshot.admin.build, latestRelease.admin.build);

const pageSource = readFileSync("app/admin/app-store/page.tsx", "utf8");
const consoleSource = readFileSync("app/admin/app-store/app-store-console.tsx", "utf8");
assert.match(pageSource, /requireAdminUser\(\)/);
assert.match(pageSource, /redirect\("\/login\?redirectTo=\/admin\/app-store"\)/);
assert.match(consoleSource, /rollbackService\.rollbackToVersion/);
assert.match(consoleSource, /Rollout %/);
assert.match(consoleSource, /Force update/);

const releaseScript = readFileSync("scripts/release-all-installers.ps1", "utf8");
assert.match(releaseScript, /apps = \[ordered\]@\{/);
assert.match(releaseScript, /active_version = \$Version/);
assert.match(releaseScript, /versions = \$Versions/);

const legacyManifest = normalizeLatestReleaseManifest({
  updated_at: "2026-06-13T00:00:00.000Z",
  user: {
    app_name: "Legacy User",
    version: "1.0.1",
    build: 101,
    minimum_build: 100,
    force_update: false,
    web_url: userWebUrl,
    apk_url: userApkUrl,
    exe_url: userExeUrl,
    download_page: downloadPage,
    changelog: []
  },
  admin: {
    app_name: "Legacy Admin",
    version: "1.0.1",
    build: 101,
    minimum_build: 100,
    force_update: false,
    web_url: userWebUrl,
    apk_url: userApkUrl,
    exe_url: userExeUrl,
    download_page: downloadPage,
    changelog: []
  }
});
assert.equal(legacyManifest?.user.build, 101);

const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
assert.doesNotMatch(prismaSchema, /AppStore|app_store|Distribution|Rollback/i);
if (existsSync("prisma/migrations")) {
  const appStoreMigrations = readdirSync("prisma/migrations").filter((name) =>
    /app-store|distribution|rollback|version-catalog/i.test(name)
  );
  assert.deepEqual(appStoreMigrations, []);
}

for (const platform of ["android", "windows", "web", "electron"] as AppStorePlatform[]) {
  assert.ok(resolveDistributedDownload(testApp, { userId: stableUser, platform })?.url);
}

console.log("App Store distribution tests passed.");

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionInfo = JSON.parse(fs.readFileSync(path.join(rootDir, "version.json"), "utf8"));
const outputPath = path.join(rootDir, "public", "releases", "latest.json");
const isRelease = process.argv.includes("--release");

function readExistingManifest() {
  try {
    return JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } catch {
    return {};
  }
}

function getCurrentVersion(app) {
  if (!app || !Array.isArray(app.versions)) {
    return {};
  }

  return app.versions.find((item) => item.version === app.active_version) ?? app.versions[0] ?? {};
}

function getAssetUrl(assetName, fallbackUrl) {
  const repo = process.env.GITHUB_REPOSITORY || "caizuan2/-AI";
  const tag = process.env.RELEASE_TAG || versionInfo.version;

  if (process.env.GITHUB_REPOSITORY || process.env.RELEASE_TAG || isRelease) {
    return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
  }

  return fallbackUrl || `https://github.com/${repo}/releases/latest/download/${assetName}`;
}

function hasCurrentVersion(existing) {
  const userVersion = getCurrentVersion(existing.apps?.user);
  return userVersion.version === versionInfo.version && userVersion.build === versionInfo.build;
}

function buildVersion(appKey, existingApp, urls, updatedAt) {
  const previous = getCurrentVersion(existingApp);

  return {
    version: versionInfo.version,
    build: versionInfo.build,
    channel: "stable",
    rollout: 100,
    minimum_build: Number(previous.minimum_build) || 100,
    force_update: previous.force_update === true,
    web_url: urls.web_url || previous.web_url || "",
    apk_url: urls.apk_url || previous.apk_url || "",
    exe_url: urls.exe_url || previous.exe_url || "",
    download_page: urls.download_page || previous.download_page || "",
    changelog: Array.isArray(previous.changelog) ? previous.changelog : [],
    created_at: updatedAt
  };
}

function buildApp(appKey, appConfig, version) {
  return {
    id: appConfig.id,
    name: appConfig.name,
    platforms: ["android", "windows", "ios", "macos", "web", "electron"],
    active_version: versionInfo.version,
    versions: [version]
  };
}

function snapshot(app) {
  const version = getCurrentVersion(app);

  return {
    app_name: app.name,
    version: version.version,
    build: version.build,
    minimum_build: version.minimum_build,
    force_update: version.force_update,
    web_url: version.web_url,
    apk_url: version.apk_url,
    exe_url: version.exe_url,
    download_page: version.download_page,
    changelog: version.changelog
  };
}

if (typeof versionInfo.version !== "string" || !Number.isInteger(versionInfo.build)) {
  throw new Error("version.json must contain version and build.");
}

const existing = readExistingManifest();
const updatedAt = isRelease || !hasCurrentVersion(existing)
  ? new Date().toISOString()
  : existing.updated_at || new Date().toISOString();

const apkAsset = process.env.APK_ASSET || "ai-knowledge-chat-latest.apk";
const exeAsset = process.env.EXE_ASSET || "ai-knowledge-chat-latest.exe";
const userExisting = existing.apps?.user;
const adminExisting = existing.apps?.admin;

const userVersion = buildVersion("user", userExisting, {
  web_url: process.env.USER_WEB_URL || "https://stately-sawine-1efd4d.netlify.app/chat-ui",
  apk_url: getAssetUrl(apkAsset, getCurrentVersion(userExisting).apk_url),
  exe_url: getAssetUrl(exeAsset, getCurrentVersion(userExisting).exe_url),
  download_page: "https://stately-sawine-1efd4d.netlify.app/download"
}, updatedAt);

const adminVersion = buildVersion("admin", adminExisting, {
  web_url: process.env.ADMIN_WEB_URL || "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest",
  apk_url: getCurrentVersion(adminExisting).apk_url || "https://github.com/caizuan2/-AI/releases/latest/download/ai-knowledge-admin-latest.apk",
  exe_url: getCurrentVersion(adminExisting).exe_url || "https://github.com/caizuan2/-AI/releases/latest/download/ai-knowledge-admin-latest.exe",
  download_page: "https://stately-sawine-1efd4d.netlify.app/admin-download"
}, updatedAt);

const apps = {
  user: buildApp("user", {
    id: "ai.chat.user",
    name: "AI知识库助手",
    existing: userExisting
  }, userVersion),
  admin: buildApp("admin", {
    id: "ai.chat.admin",
    name: "AI知识库管理后台",
    existing: adminExisting
  }, adminVersion)
};

const manifest = {
  updated_at: updatedAt,
  version: versionInfo.version,
  build: versionInfo.build,
  apk: apkAsset,
  exe: exeAsset,
  apk_url: userVersion.apk_url,
  exe_url: userVersion.exe_url,
  web_url: userVersion.web_url,
  apps,
  user: snapshot(apps.user),
  admin: snapshot(apps.admin)
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
JSON.parse(fs.readFileSync(outputPath, "utf8"));

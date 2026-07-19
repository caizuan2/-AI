import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = path.join(rootDir, "version.json");
const versionInfo = JSON.parse(fs.readFileSync(versionPath, "utf8"));
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

  return `https://github.com/${repo}/releases/latest/download/${assetName}`;
}

function readGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function normalizeValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") {
    return "";
  }

  return trimmed;
}

function pickValue(...values) {
  for (const value of values) {
    const normalized = normalizeValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function writeVersionReleaseSha(webReleaseSha) {
  const normalizedReleaseSha = normalizeValue(webReleaseSha);
  if (!normalizedReleaseSha) {
    return;
  }

  const nextVersionInfo = {
    ...versionInfo,
    web_release_sha: normalizedReleaseSha
  };
  const nextContent = `${JSON.stringify(nextVersionInfo, null, 2)}\n`;

  if (fs.readFileSync(versionPath, "utf8") !== nextContent) {
    fs.writeFileSync(versionPath, nextContent, "utf8");
  }

  versionInfo.web_release_sha = normalizedReleaseSha;
}

function hasCurrentVersion(existing) {
  const userVersion = getCurrentVersion(existing.apps?.user);
  return userVersion.version === versionInfo.version && userVersion.build === versionInfo.build;
}

function buildVersion(appKey, existingApp, urls, updatedAt) {
  const previous = getCurrentVersion(existingApp);
  const preserveExistingVersion = appKey === "admin"
    && typeof previous.version === "string"
    && Number.isInteger(previous.build);

  return {
    version: preserveExistingVersion ? previous.version : versionInfo.version,
    build: preserveExistingVersion ? previous.build : versionInfo.build,
    channel: "stable",
    rollout: 100,
    minimum_build: Number(previous.minimum_build) || 100,
    force_update: previous.force_update === true,
    web_release_sha: pickValue(urls.web_release_sha, previous.web_release_sha),
    web_url: pickValue(urls.web_url, previous.web_url),
    apk_url: pickValue(urls.apk_url, previous.apk_url),
    exe_url: pickValue(urls.exe_url, previous.exe_url),
    download_page: pickValue(urls.download_page, previous.download_page),
    changelog: Array.isArray(previous.changelog) ? previous.changelog : [],
    created_at: preserveExistingVersion && previous.created_at ? previous.created_at : updatedAt
  };
}

function buildApp(appKey, appConfig, version) {
  return {
    id: appConfig.id,
    name: appConfig.name,
    platforms: ["android", "windows", "ios", "macos", "web", "electron"],
    active_version: version.version,
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
    web_release_sha: version.web_release_sha,
    web_url: version.web_url,
    apk_url: version.apk_url,
    exe_url: version.exe_url,
    download_page: version.download_page,
    changelog: version.changelog
  };
}

function getLegacyElectronVersion() {
  const version = versionInfo.legacy_electron_version;

  if (typeof version !== "string" || !version.trim()) {
    throw new Error("version.json must contain a valid legacy_electron_version.");
  }

  return version.trim();
}

function legacyElectronSnapshot(app) {
  const release = snapshot(app);

  return {
    ...release,
    version: getLegacyElectronVersion()
  };
}

if (typeof versionInfo.version !== "string" || !Number.isInteger(versionInfo.build)) {
  throw new Error("version.json must contain version and build.");
}

const existing = readExistingManifest();
let updatedAt = isRelease || !hasCurrentVersion(existing)
  ? new Date().toISOString()
  : existing.updated_at || new Date().toISOString();

const apkAsset = process.env.APK_ASSET || "ai-knowledge-chat-latest.apk";
const exeAsset = process.env.EXE_ASSET || "ai-knowledge-chat-latest.exe";
const userExisting = existing.apps?.user;
const adminExisting = existing.apps?.admin;
const webReleaseSha = pickValue(
  process.env.WEB_RELEASE_SHA,
  process.env.NEXT_PUBLIC_WEB_RELEASE_SHA,
  process.env.NEXT_PUBLIC_RELEASE_SHA,
  readGitSha()
);
const adminWebReleaseSha = pickValue(
  process.env.ADMIN_WEB_RELEASE_SHA,
  webReleaseSha,
  getCurrentVersion(adminExisting).web_release_sha,
  existing.admin?.web_release_sha,
  existing.apps?.admin?.versions?.[0]?.web_release_sha
);

if (
  webReleaseSha !== pickValue(existing.web_release_sha, getCurrentVersion(userExisting).web_release_sha)
  || adminWebReleaseSha !== pickValue(existing.admin?.web_release_sha, getCurrentVersion(adminExisting).web_release_sha)
) {
  updatedAt = new Date().toISOString();
}

writeVersionReleaseSha(webReleaseSha);

const userVersion = buildVersion("user", userExisting, {
  web_release_sha: webReleaseSha,
  web_url: process.env.USER_WEB_URL || "http://47.238.0.23/app/chat",
  apk_url: getAssetUrl(apkAsset, getCurrentVersion(userExisting).apk_url),
  exe_url: getAssetUrl(exeAsset, getCurrentVersion(userExisting).exe_url),
  download_page: process.env.USER_DOWNLOAD_PAGE || "http://47.238.0.23/download"
}, updatedAt);

const adminVersion = buildVersion("admin", adminExisting, {
  web_release_sha: adminWebReleaseSha,
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
  minimum_build: userVersion.minimum_build,
  forceUpdate: userVersion.force_update,
  force_update: userVersion.force_update,
  web_release_sha: userVersion.web_release_sha,
  apk: apkAsset,
  exe: exeAsset,
  apk_url: userVersion.apk_url,
  exe_url: userVersion.exe_url,
  web_url: userVersion.web_url,
  download: {
    android: userVersion.apk_url,
    windows: userVersion.exe_url,
    web: userVersion.web_url,
    page: userVersion.download_page
  },
  apps,
  // Electron 1.0.10 reads this legacy snapshot before `apps.user` and compares
  // only its version. Keep that version on the newest Web-compatible Electron
  // shell so Web-only releases do not open an installer. Build and download
  // metadata stay current for other legacy clients; current UI uses apps.user.
  user: legacyElectronSnapshot(apps.user),
  admin: snapshot(apps.admin)
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
JSON.parse(fs.readFileSync(outputPath, "utf8"));

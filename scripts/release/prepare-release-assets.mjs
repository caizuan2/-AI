import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const CONFIG = {
  apk: {
    root: "artifacts/admin-ingest/apk",
    assetName: "admin-ingest.apk",
    extension: ".apk",
    missingReason: "APK_RELEASE_ASSET_NOT_FOUND_AFTER_BUILD"
  },
  exe: {
    root: "artifacts/admin-ingest/exe",
    assetName: "admin-ingest.exe",
    extension: ".exe",
    missingReason: "EXE_RELEASE_ASSET_NOT_FOUND_AFTER_BUILD"
  }
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function findFiles(root, predicate) {
  const output = [];
  const queue = [resolve(root)];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!existsSync(current)) {
      continue;
    }
    const stats = statSync(current);
    if (stats.isFile()) {
      if (predicate(current)) {
        output.push(current);
      }
      continue;
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current)) {
        queue.push(resolve(current, entry));
      }
    }
  }
  return output;
}

function readJson(path, fallback = null) {
  if (!path) {
    return fallback;
  }
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function releaseInfo() {
  const raw = execFileSync("node", ["scripts/release/resolve-version.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  return JSON.parse(raw);
}

function writeJson(path, value, dryRun) {
  if (dryRun) {
    return;
  }
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function prepareOne(platform, info, dryRun) {
  const cfg = CONFIG[platform];
  const root = resolve(cfg.root);
  const manifestPath = resolve(root, "manifest.json");
  const manifestCandidates = findFiles(root, (file) => file.endsWith("manifest.json"));
  const sourceManifestPath = existsSync(manifestPath) ? manifestPath : manifestCandidates[0];
  const manifest = readJson(sourceManifestPath, {
    platform,
    app: "admin-ingest",
    available: false,
    reason: `${platform.toUpperCase()}_MANIFEST_NOT_FOUND`
  });
  if (!dryRun) {
    mkdirSync(root, { recursive: true });
  }

  if (!manifest.available) {
    writeJson(manifestPath, { ...manifest, available: false }, dryRun);
    return { platform, available: false, reason: manifest.reason || `${platform.toUpperCase()}_ARTIFACT_NOT_AVAILABLE` };
  }

  const targetPath = resolve(root, cfg.assetName);
  const candidates = findFiles(root, (file) => {
    const base = file.replace(/\\/g, "/").split("/").pop();
    return base === cfg.assetName || extname(file).toLowerCase() === cfg.extension;
  }).filter((file) => !file.endsWith("manifest.json"));
  const source = candidates.find((file) => resolve(file) === targetPath) || candidates[0];

  if (!source || !existsSync(source)) {
    const nextManifest = {
      ...manifest,
      available: false,
      path: null,
      assetName: cfg.assetName,
      reason: cfg.missingReason
    };
    writeJson(manifestPath, nextManifest, dryRun);
    return { platform, available: false, reason: cfg.missingReason };
  }

  if (!dryRun && resolve(source) !== targetPath) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(source, targetPath);
  }

  const stats = statSync(dryRun ? source : targetPath);
  const downloadUrl = platform === "apk" ? info.apkDownloadUrl : info.exeDownloadUrl;
  const latestDownloadUrl = platform === "apk" ? info.latestApkUrl : info.latestExeUrl;
  const nextManifest = {
    ...manifest,
    platform,
    app: "admin-ingest",
    available: true,
    path: cfg.root.replace(/\\/g, "/") + `/${cfg.assetName}`,
    assetName: cfg.assetName,
    downloadUrl,
    latestDownloadUrl,
    size: stats.size,
    sha256: sha256(dryRun ? source : targetPath),
    reason: null
  };
  writeJson(manifestPath, nextManifest, dryRun);
  return { platform, available: true, assetName: cfg.assetName, path: nextManifest.path };
}

const dryRun = hasFlag("--dry-run");
const info = releaseInfo();
console.log(JSON.stringify({
  ok: true,
  dryRun,
  apk: prepareOne("apk", info, dryRun),
  exe: prepareOne("exe", info, dryRun)
}, null, 2));

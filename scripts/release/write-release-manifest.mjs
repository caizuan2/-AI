import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OUT = "artifacts/admin-ingest/release-manifest.json";
const DEFAULT_WEB = "artifacts/admin-ingest/web/manifest.json";
const DEFAULT_APK = "artifacts/admin-ingest/apk/manifest.json";
const DEFAULT_EXE = "artifacts/admin-ingest/exe/manifest.json";

function hasFlag(name) {
  return process.argv.includes(name);
}

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return fallback;
  }
}

function readReleaseInfo() {
  const raw = execFileSync("node", ["scripts/release/resolve-version.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  return JSON.parse(raw);
}

function findNestedManifest(rootPath) {
  const root = resolve(rootPath);
  if (!existsSync(root)) {
    return null;
  }

  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    const stats = statSync(current);
    if (stats.isFile() && current.endsWith("manifest.json")) {
      return current;
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current)) {
        queue.push(resolve(current, entry));
      }
    }
  }

  return null;
}

function readJson(path, fallback) {
  let target = resolve(path);
  if (!existsSync(target)) {
    target = findNestedManifest(dirname(target));
    if (!target) {
      return fallback;
    }
  }

  return JSON.parse(readFileSync(target, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeArtifact(name, manifest, releaseHead) {
  if (!manifest) {
    return {
      available: false,
      head: releaseHead,
      reason: `${name.toUpperCase()}_MANIFEST_NOT_FOUND`
    };
  }

  return {
    available: Boolean(manifest.available),
    head: manifest.head || manifest.commit || releaseHead,
    path: manifest.path || null,
    url: manifest.webUrl || manifest.url || null,
    buildId: manifest.buildId || null,
    size: manifest.size || null,
    sha256: manifest.sha256 || null,
    reason: manifest.reason || null,
    buildTime: manifest.buildTime || null
  };
}

const dryRun = hasFlag("--dry-run");
const releaseInfo = readReleaseInfo();
const releaseHead = process.env.RELEASE_HEAD || releaseInfo.commit || git(["rev-parse", "HEAD"]);
const releaseTag = process.env.RELEASE_TAG || releaseInfo.tag;

const webManifest = readJson(readArg("--web", DEFAULT_WEB), dryRun ? {
  platform: "web",
  available: true,
  head: releaseHead,
  buildId: "dry-run",
  webUrl: releaseInfo.webUrl,
  path: ".next",
  buildTime: releaseInfo.buildTime
} : null);
const apkManifest = readJson(readArg("--apk", DEFAULT_APK), {
  platform: "apk",
  available: false,
  head: releaseHead,
  reason: dryRun ? "APK_DRY_RUN_NO_ARTIFACT" : "APK_MANIFEST_NOT_FOUND"
});
const exeManifest = readJson(readArg("--exe", DEFAULT_EXE), {
  platform: "exe",
  available: false,
  head: releaseHead,
  reason: dryRun ? "EXE_DRY_RUN_NO_ARTIFACT" : "EXE_MANIFEST_NOT_FOUND"
});

const releaseManifest = {
  app: "admin-ingest",
  version: releaseInfo.version,
  environment: releaseInfo.environment,
  releaseHead,
  releaseTag,
  branch: releaseInfo.branch,
  buildNumber: releaseInfo.buildNumber,
  buildTime: new Date().toISOString(),
  artifactPrefix: releaseInfo.artifactPrefix,
  dryRun,
  web: normalizeArtifact("web", webManifest, releaseHead),
  apk: normalizeArtifact("apk", apkManifest, releaseHead),
  exe: normalizeArtifact("exe", exeManifest, releaseHead),
  rollback: {
    previousHead: process.env.ROLLBACK_PREVIOUS_HEAD || releaseInfo.rollback?.previousHead || null,
    previousTag: process.env.ROLLBACK_PREVIOUS_TAG || releaseInfo.rollback?.previousTag || null,
    backupBranch: process.env.ROLLBACK_BACKUP_BRANCH || null,
    script: "scripts/rollback/rollback-admin-ingest.sh"
  }
};

if (!dryRun) {
  const outPath = resolve(readArg("--out", DEFAULT_OUT));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(releaseManifest, null, 2));
if (dryRun) {
  console.log("RELEASE_MANIFEST_DRY_RUN=true");
}

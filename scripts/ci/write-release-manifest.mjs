import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OUT = "artifacts/admin-ingest/release-manifest.json";
const DEFAULT_WEB = "artifacts/admin-ingest/web/manifest.json";
const DEFAULT_APK = "artifacts/admin-ingest/apk/manifest.json";
const DEFAULT_EXE = "artifacts/admin-ingest/exe/manifest.json";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
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

  return JSON.parse(readFileSync(target, "utf8"));
}

const releaseHead = process.env.RELEASE_HEAD || git(["rev-parse", "HEAD"]);
const releaseTag = process.env.RELEASE_TAG || git(["describe", "--tags", "--exact-match", releaseHead], `manual-${releaseHead.slice(0, 8)}`);
const buildTime = new Date().toISOString();

const webManifest = readJson(readArg("--web") || DEFAULT_WEB, null);
const apkManifest = readJson(readArg("--apk") || DEFAULT_APK, {
  platform: "apk",
  app: "admin-ingest",
  available: false,
  head: releaseHead,
  reason: "APK_MANIFEST_NOT_FOUND"
});
const exeManifest = readJson(readArg("--exe") || DEFAULT_EXE, {
  platform: "exe",
  app: "admin-ingest",
  available: false,
  head: releaseHead,
  reason: "EXE_MANIFEST_NOT_FOUND"
});

const releaseManifest = {
  app: "admin-ingest",
  releaseHead,
  releaseTag,
  buildTime,
  web: webManifest
    ? {
        available: true,
        head: webManifest.head || webManifest.commit,
        buildId: webManifest.buildId,
        url: webManifest.webUrl,
        path: webManifest.path || ".next",
        buildTime: webManifest.buildTime
      }
    : {
        available: false,
        head: releaseHead,
        reason: "WEB_MANIFEST_NOT_FOUND"
      },
  apk: {
    available: Boolean(apkManifest.available),
    head: apkManifest.head || apkManifest.commit || releaseHead,
    path: apkManifest.path || null,
    size: apkManifest.size || null,
    sha256: apkManifest.sha256 || null,
    reason: apkManifest.reason || null,
    buildTime: apkManifest.buildTime || null
  },
  exe: {
    available: Boolean(exeManifest.available),
    head: exeManifest.head || exeManifest.commit || releaseHead,
    path: exeManifest.path || null,
    size: exeManifest.size || null,
    sha256: exeManifest.sha256 || null,
    reason: exeManifest.reason || null,
    buildTime: exeManifest.buildTime || null
  }
};

const outPath = resolve(readArg("--out") || DEFAULT_OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(releaseManifest, null, 2));

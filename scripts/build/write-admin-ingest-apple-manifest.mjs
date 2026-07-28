import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return fallback;
  }
}

const platform = readArg("--platform");
const artifactPath = path.resolve(readArg("--artifact"));
const installerType = readArg("--installer-type");
const productName = readArg("--product-name") || "小董AI";

if (!["ios", "macos"].includes(platform)) {
  throw new Error("--platform must be ios or macos");
}

if (!artifactPath || !installerType) {
  throw new Error("--artifact and --installer-type are required");
}

const release = JSON.parse(
  readFileSync("config/admin-ingest/release.json", "utf8")
);
const bytes = readFileSync(artifactPath);
const stats = statSync(artifactPath);
const head = process.env.RELEASE_HEAD || git(["rev-parse", "HEAD"]);
const tag = process.env.RELEASE_TAG || release.release_tag;
const manifestPath = path.join(path.dirname(artifactPath), "manifest.json");

mkdirSync(path.dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({
  platform,
  app: "admin-ingest",
  available: true,
  head,
  commit: head,
  branch: git(["branch", "--show-current"], "detached"),
  tag,
  version: release.version,
  build: Number(release.build),
  installerType,
  productName,
  buildTime: new Date().toISOString(),
  path: artifactPath,
  assetName: path.basename(artifactPath),
  size: stats.size,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  lastWriteTime: stats.mtime.toISOString()
}, null, 2)}\n`, "utf8");

console.log(`APPLE_MANIFEST_PATH=${manifestPath}`);

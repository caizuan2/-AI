import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function readManifest(dryRun) {
  const manifestPath = resolve(readArg("--manifest", "artifacts/admin-ingest/release-manifest.json"));
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  }

  if (!dryRun) {
    throw new Error(`Release manifest not found: ${manifestPath}`);
  }

  const raw = execFileSync("node", ["scripts/release/write-release-manifest.mjs", "--dry-run"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
}

function checkHead(name, artifact, releaseHead, errors) {
  if (!artifact) {
    errors.push(`${name} manifest is required`);
    return;
  }

  if (!artifact.available) {
    if (!artifact.reason) {
      errors.push(`${name}.reason is required when ${name}.available=false`);
    }
    return;
  }

  if (artifact.head !== releaseHead) {
    errors.push(`${name}.head mismatch expected=${releaseHead} actual=${artifact.head}`);
  }
}

const dryRun = hasFlag("--dry-run");
const manifest = readManifest(dryRun);
const errors = [];

if (!manifest.releaseHead) {
  errors.push("releaseHead is required");
}

if (!manifest.web?.available) {
  errors.push("web.available must be true");
} else if (manifest.web.head !== manifest.releaseHead) {
  errors.push(`web.head mismatch expected=${manifest.releaseHead} actual=${manifest.web.head}`);
}

checkHead("apk", manifest.apk, manifest.releaseHead, errors);
checkHead("exe", manifest.exe, manifest.releaseHead, errors);

if (errors.length > 0) {
  console.error("WEB_APK_EXE_SYNC=false");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("WEB_APK_EXE_SYNC=true");
console.log(`RELEASE_HEAD=${manifest.releaseHead}`);
console.log(`RELEASE_TAG=${manifest.releaseTag || ""}`);
console.log(`RELEASE_ENV=${manifest.environment || ""}`);
if (dryRun) {
  console.log("VERIFY_RELEASE_SYNC_DRY_RUN=true");
}

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

function checkArtifact(name, artifact, manifest, errors) {
  if (!artifact) {
    errors.push(`${name} manifest is required`);
    return;
  }

  if (!artifact.available) {
    if (!dryRun) {
      errors.push(`${name}.available must be true`);
    }
    return;
  }

  if (artifact.head !== manifest.releaseHead) {
    errors.push(`${name}.head mismatch expected=${manifest.releaseHead} actual=${artifact.head}`);
  }

  if (artifact.version !== manifest.version) {
    errors.push(`${name}.version mismatch expected=${manifest.version} actual=${artifact.version}`);
  }

  if (Number(artifact.build) !== Number(manifest.build)) {
    errors.push(`${name}.build mismatch expected=${manifest.build} actual=${artifact.build}`);
  }

  if (!dryRun && name !== "web") {
    if (!artifact.path || !artifact.assetName || !artifact.downloadUrl || !artifact.latestDownloadUrl) {
      errors.push(`${name} package metadata is incomplete`);
    }
    if (!artifact.sha256 || !artifact.size) {
      errors.push(`${name} package hash and size are required`);
    }
    if (name === "exe" && artifact.installerType !== "nsis") {
      errors.push(`exe.installerType must be nsis, actual=${artifact.installerType || "missing"}`);
    }
  }
}

const dryRun = hasFlag("--dry-run");
const manifest = readManifest(dryRun);
const errors = [];

if (!manifest.releaseHead) {
  errors.push("releaseHead is required");
}

checkArtifact("web", manifest.web, manifest, errors);
checkArtifact("apk", manifest.apk, manifest, errors);
checkArtifact("exe", manifest.exe, manifest, errors);

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

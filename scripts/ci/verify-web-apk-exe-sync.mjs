import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

const manifestPath = resolve(readArg("--manifest") || "artifacts/admin-ingest/release-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = [];

function requireArtifact(name, artifact) {
  if (!artifact.available) {
    errors.push(`${name}.available must be true`);
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

  if (name !== "web") {
    if (!artifact.path || !artifact.assetName || !artifact.downloadUrl || !artifact.latestDownloadUrl) {
      errors.push(`${name} package metadata is incomplete`);
    }
    if (!artifact.sha256 || !artifact.size) {
      errors.push(`${name} package hash and size are required`);
    }
    if (name === "exe" && artifact.installerType !== "nsis") {
      errors.push(`exe.installerType must be nsis, actual=${artifact.installerType || "missing"}`);
    }
    if (name === "exe" && artifact.productName !== "小董AI投喂端") {
      errors.push(`exe.productName mismatch actual=${artifact.productName || "missing"}`);
    }
    if (name === "exe" && artifact.internalVersion !== manifest.version) {
      errors.push(`exe.internalVersion mismatch expected=${manifest.version} actual=${artifact.internalVersion || "missing"}`);
    }
    if (name === "exe" && Number(artifact.internalBuild) !== Number(manifest.build)) {
      errors.push(`exe.internalBuild mismatch expected=${manifest.build} actual=${artifact.internalBuild || "missing"}`);
    }
    if (name === "exe" && artifact.internalWebReleaseSha !== manifest.releaseHead) {
      errors.push(`exe.internalWebReleaseSha mismatch expected=${manifest.releaseHead} actual=${artifact.internalWebReleaseSha || "missing"}`);
    }
  }
}

if (!manifest.releaseHead) {
  errors.push("releaseHead is required");
}

requireArtifact("web", manifest.web || {});
requireArtifact("apk", manifest.apk || {});
requireArtifact("exe", manifest.exe || {});

if (errors.length > 0) {
  console.error("WEB_APK_EXE_SYNC=false");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("WEB_APK_EXE_SYNC=true");
console.log(`RELEASE_HEAD=${manifest.releaseHead}`);

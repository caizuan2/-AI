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

function requireHead(name, artifact) {
  if (!artifact.available) {
    if (!artifact.reason) {
      errors.push(`${name}.reason is required when ${name}.available=false`);
    }
    return;
  }

  if (artifact.head !== manifest.releaseHead) {
    errors.push(`${name}.head mismatch expected=${manifest.releaseHead} actual=${artifact.head}`);
  }
}

if (!manifest.releaseHead) {
  errors.push("releaseHead is required");
}

if (!manifest.web?.available) {
  errors.push("web.available must be true");
} else if (manifest.web.head !== manifest.releaseHead) {
  errors.push(`web.head mismatch expected=${manifest.releaseHead} actual=${manifest.web.head}`);
}

requireHead("apk", manifest.apk || {});
requireHead("exe", manifest.exe || {});

if (errors.length > 0) {
  console.error("WEB_APK_EXE_SYNC=false");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("WEB_APK_EXE_SYNC=true");
console.log(`RELEASE_HEAD=${manifest.releaseHead}`);

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_MANIFEST = "artifacts/admin-ingest/release-manifest.json";

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

function loadManifest() {
  const manifestPath = resolve(readArg("--manifest", DEFAULT_MANIFEST));
  if (!existsSync(manifestPath)) {
    throw new Error(`RELEASE_MANIFEST_NOT_FOUND: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error(`GITHUB_API_ERROR_${response.status}: ${url}`);
  }
  return response.json();
}

function requiredAssetNames(manifest) {
  const names = ["release-manifest.json", "release-notes.md"];
  for (const artifact of [manifest.apk, manifest.exe]) {
    if (artifact?.available && artifact.assetName) {
      names.push(artifact.assetName);
    }
  }
  return names;
}

const dryRun = hasFlag("--dry-run");
if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    reason: "GITHUB_RELEASE_ASSET_CHECK_DRY_RUN"
  }, null, 2));
  process.exit(0);
}

const manifest = loadManifest();
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: "GITHUB_TOKEN_NOT_CONFIGURED_SKIP_REMOTE_ASSET_CHECK"
  }, null, 2));
  process.exit(0);
}

const repository = readArg("--repo", manifest.repository || manifest.github?.repository);
const tag = readArg("--tag", manifest.releaseTag);
if (!repository || !tag) {
  throw new Error("GITHUB_REPOSITORY_AND_RELEASE_TAG_REQUIRED");
}

const release = await githubJson(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, token);
const assetNames = new Set((release.assets || []).map((asset) => asset.name));
const missing = requiredAssetNames(manifest).filter((name) => !assetNames.has(name));

if (missing.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    repository,
    tag,
    missing,
    actual: Array.from(assetNames).sort()
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  repository,
  tag,
  assets: Array.from(assetNames).sort()
}, null, 2));

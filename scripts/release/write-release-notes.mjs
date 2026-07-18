import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_MANIFEST = "artifacts/admin-ingest/release-manifest.json";
const DEFAULT_OUT = "artifacts/admin-ingest/release-notes.md";

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

function loadManifest(dryRun) {
  const manifestPath = resolve(readArg("--manifest", DEFAULT_MANIFEST));
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  }

  if (!dryRun) {
    throw new Error(`RELEASE_MANIFEST_NOT_FOUND: ${manifestPath}`);
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

function artifactLine(label, artifact) {
  if (artifact?.available) {
    const url = artifact.downloadUrl || artifact.url;
    const suffix = url ? ` - ${url}` : "";
    return `- ${label}: available (${artifact.assetName || artifact.path || "artifact"})${suffix}`;
  }
  return `- ${label}: unavailable (${artifact?.reason || "UNKNOWN_REASON"})`;
}

const dryRun = hasFlag("--dry-run");
const manifest = loadManifest(dryRun);
const notes = [
  `# Admin Ingest Release ${manifest.releaseTag || manifest.buildNumber || ""}`.trim(),
  "",
  `- Repository: ${manifest.repository || manifest.github?.repository || "unknown"}`,
  `- Environment: ${manifest.environment || "unknown"}`,
  `- Version: ${manifest.version || "unknown"}`,
  `- Release head: ${manifest.releaseHead || "unknown"}`,
  `- Build number: ${manifest.buildNumber || "unknown"}`,
  `- Web URL: ${manifest.web?.url || manifest.web?.webUrl || "unavailable"}`,
  "",
  "## Artifacts",
  "",
  artifactLine("Web", manifest.web),
  artifactLine("APK", manifest.apk),
  artifactLine("EXE", manifest.exe),
  "",
  "## Verification",
  "",
  "- Available artifacts must match the release head.",
  "- APK/EXE download buttons should only be shown when the artifact is available.",
  "- Unavailable APK/EXE artifacts are valid only with an explicit reason.",
  ""
].join("\n");

if (!dryRun) {
  const outPath = resolve(readArg("--out", DEFAULT_OUT));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, notes, "utf8");
}

console.log(notes);
if (dryRun) {
  console.log("RELEASE_NOTES_DRY_RUN=true");
}

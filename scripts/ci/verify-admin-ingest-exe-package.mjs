import { extractFile } from "@electron/asar";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`${name} is required`);
  }
  return process.argv[index + 1];
}

function readAsarJson(archivePath, path) {
  const normalizedPath = path.replaceAll("/", "\\");
  const payload = extractFile(archivePath, normalizedPath);
  return JSON.parse(payload.toString("utf8").replace(/^\uFEFF/, ""));
}

const archivePath = resolve(readArg("--asar"));
const expectedVersion = readArg("--version");
const expectedBuild = Number(readArg("--build"));
const expectedWebReleaseSha = readArg("--web-release-sha");

if (!existsSync(archivePath)) {
  throw new Error(`EXE_APP_ASAR_NOT_FOUND: ${archivePath}`);
}

const packageJson = readAsarJson(archivePath, "package.json");
const buildMetadata = readAsarJson(
  archivePath,
  "electron/admin-ingest/build-metadata.json"
);
const errors = [];

if (packageJson.version !== expectedVersion) {
  errors.push(
    `package.version mismatch expected=${expectedVersion} actual=${packageJson.version || "missing"}`
  );
}
if (buildMetadata.version !== expectedVersion) {
  errors.push(
    `metadata.version mismatch expected=${expectedVersion} actual=${buildMetadata.version || "missing"}`
  );
}
if (Number(buildMetadata.build) !== expectedBuild) {
  errors.push(
    `metadata.build mismatch expected=${expectedBuild} actual=${buildMetadata.build ?? "missing"}`
  );
}
if (buildMetadata.webReleaseSha !== expectedWebReleaseSha) {
  errors.push(
    `metadata.webReleaseSha mismatch expected=${expectedWebReleaseSha} actual=${buildMetadata.webReleaseSha || "missing"}`
  );
}

if (errors.length > 0) {
  console.error("ADMIN_INGEST_EXE_INTERNAL_SYNC=false");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("ADMIN_INGEST_EXE_INTERNAL_SYNC=true");
console.log(`EXE_INTERNAL_VERSION=${expectedVersion}`);
console.log(`EXE_INTERNAL_BUILD=${expectedBuild}`);
console.log(`EXE_INTERNAL_WEB_RELEASE_SHA=${expectedWebReleaseSha}`);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = path.join(rootDir, "version.json");
const packagePath = path.join(rootDir, "package.json");

function readVersionInfo() {
  const versionInfo = JSON.parse(fs.readFileSync(versionPath, "utf8"));

  if (typeof versionInfo.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionInfo.version)) {
    throw new Error("version.json version must be a valid semantic version string.");
  }

  if (!Number.isInteger(versionInfo.build) || versionInfo.build <= 0) {
    throw new Error("version.json build must be a positive integer.");
  }

  return versionInfo;
}

function writeEnv(versionInfo) {
  const lines = [
    `VERSION=${versionInfo.version}`,
    `BUILD=${versionInfo.build}`,
    `APP_VERSION=${versionInfo.version}`,
    `APP_BUILD=${versionInfo.build}`,
    `RELEASE_TAG=${versionInfo.version}`
  ].join("\n");

  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `${lines}\n`, "utf8");
    return;
  }

  process.stdout.write(`${lines}\n`);
}

function writePackageVersion(versionInfo) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  if (packageJson.version === versionInfo.version) {
    return;
  }

  packageJson.version = versionInfo.version;
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

const args = new Set(process.argv.slice(2));
const versionInfo = readVersionInfo();

if (args.has("--env")) {
  writeEnv(versionInfo);
}

if (args.has("--package")) {
  writePackageVersion(versionInfo);
}

if (!args.has("--env") && !args.has("--package")) {
  process.stdout.write(`${JSON.stringify(versionInfo, null, 2)}\n`);
}

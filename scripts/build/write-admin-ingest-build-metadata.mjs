import { writeFileSync } from "node:fs";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const output = readArg("--output");
const version = readArg("--version");
const build = Number(readArg("--build"));
const webReleaseSha = readArg("--web-release-sha");
const webUrl = readArg("--web-url");
const platform = readArg("--platform");

if (
  !output
  || !version
  || !Number.isInteger(build)
  || build <= 0
  || !webReleaseSha
  || platform !== "macos"
) {
  throw new Error("Invalid admin-ingest macOS build metadata arguments.");
}

const targetUrl = new URL(webUrl);
if (
  targetUrl.protocol !== "https:"
  || !targetUrl.pathname.startsWith("/admin-ingest")
) {
  throw new Error("macOS build metadata requires an HTTPS /admin-ingest URL.");
}

targetUrl.searchParams.set("app", "ingest-admin");
targetUrl.searchParams.set("platform", "macos");

writeFileSync(output, `${JSON.stringify({
  version,
  build,
  webReleaseSha,
  webUrl: targetUrl.toString(),
  platform
}, null, 2)}\n`, "utf8");

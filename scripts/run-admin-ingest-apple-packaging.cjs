const { spawnSync } = require("node:child_process");
const path = require("node:path");

const target = process.argv[2];
const scripts = {
  ios: "scripts/build/build-admin-ingest-ios.sh",
  macos: "scripts/build/build-admin-ingest-macos.sh"
};

if (!scripts[target]) {
  console.error("Usage: node scripts/run-admin-ingest-apple-packaging.cjs <ios|macos>");
  process.exit(1);
}

if (process.platform !== "darwin") {
  console.error(`Admin-ingest ${target} packaging requires macOS with Apple build tools.`);
  process.exit(1);
}

const result = spawnSync("bash", [path.resolve(scripts[target])], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

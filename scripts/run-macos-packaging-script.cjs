const { spawnSync } = require("node:child_process");
const path = require("node:path");

const [, , platformKind, scriptPath] = process.argv;

if (!platformKind || !scriptPath) {
  console.error("Usage: node scripts/run-macos-packaging-script.cjs <ios|macos> <script>");
  process.exit(1);
}

if (process.platform !== "darwin") {
  if (platformKind === "ios") {
    console.log("iOS IPA 需要在 macOS + Xcode 环境下打包。");
    process.exit(0);
  }

  if (platformKind === "macos") {
    console.log("macOS DMG 需要在 macOS 环境打包。");
    process.exit(0);
  }

  console.error(`Unsupported macOS packaging kind: ${platformKind}`);
  process.exit(1);
}

const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
const result = spawnSync("bash", [absoluteScriptPath], { stdio: "inherit" });

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error.message);
}

process.exit(1);

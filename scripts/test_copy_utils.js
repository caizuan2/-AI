#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "pnpm";
const args = isWindows
  ? ["/d", "/s", "/c", "pnpm exec tsx scripts/test_copy_utils.ts"]
  : ["exec", "tsx", "scripts/test_copy_utils.ts"];
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}

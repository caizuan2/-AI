import { execFileSync } from "node:child_process";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  }).trim();
}

const label = readArg("--label") || process.env.RELEASE_LABEL || "current";
const actual = git(["rev-parse", "HEAD"]);
const expected = readArg("--expected") || process.env.RELEASE_HEAD || process.env.GITHUB_SHA || actual;

if (actual !== expected) {
  console.error(`VERIFY_RELEASE_HEAD_FAILED: ${label} head mismatch expected=${expected} actual=${actual}`);
  process.exit(1);
}

console.log(`VERIFY_RELEASE_HEAD_OK: ${label}=${actual}`);

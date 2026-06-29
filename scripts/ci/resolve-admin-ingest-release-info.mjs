import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const WEB_URL = "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=web";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return fallback;
  }
}

function resolveTag(commit) {
  if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }

  const exactTag = git(["describe", "--tags", "--exact-match", commit]);
  if (exactTag) {
    return exactTag;
  }

  const pointedTags = git(["tag", "--points-at", commit])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  return pointedTags[0] || `manual-${commit.slice(0, 8)}`;
}

const commit = git(["rev-parse", "HEAD"]);
if (!commit) {
  console.error("RELEASE_INFO_ERROR: git rev-parse HEAD returned empty commit");
  process.exit(1);
}

const branch = process.env.GITHUB_REF_NAME || git(["branch", "--show-current"]) || "detached";
const tag = process.env.RELEASE_TAG || resolveTag(commit);
const buildTime = new Date().toISOString();

const releaseInfo = {
  app: "admin-ingest",
  commit,
  branch,
  tag,
  buildTime,
  webUrl: process.env.ADMIN_INGEST_WEB_URL || WEB_URL
};

const outPath = readArg("--out");
if (outPath) {
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(releaseInfo, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(releaseInfo, null, 2));

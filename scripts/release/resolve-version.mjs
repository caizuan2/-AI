import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildGithubUrls, resolveGithubRepo } from "./resolve-github-repo.mjs";

const DEFAULT_WEB_URLS = {
  dev: "http://localhost:3063/admin-ingest?app=ingest-admin&platform=web",
  staging: "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=web",
  prod: "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=web"
};
const ADMIN_RELEASE_CONFIG_PATH = "config/admin-ingest/release.json";

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
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

function normalizeEnvironment(value) {
  const normalized = String(value || "prod").trim().toLowerCase();
  if (["dev", "development", "local"].includes(normalized)) {
    return "dev";
  }
  if (["stage", "staging", "test", "qa"].includes(normalized)) {
    return "staging";
  }
  if (["prod", "production"].includes(normalized)) {
    return "prod";
  }
  throw new Error(`Unsupported release environment: ${value}`);
}

function resolveTag(configuredTag) {
  if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME) {
    if (configuredTag && process.env.GITHUB_REF_NAME !== configuredTag) {
      throw new Error(
        `Admin ingest release tag mismatch: expected=${configuredTag} actual=${process.env.GITHUB_REF_NAME}`
      );
    }
    return process.env.GITHUB_REF_NAME;
  }

  if (process.env.RELEASE_TAG && configuredTag && process.env.RELEASE_TAG !== configuredTag) {
    throw new Error(
      `Admin ingest release tag mismatch: expected=${configuredTag} actual=${process.env.RELEASE_TAG}`
    );
  }

  return process.env.RELEASE_TAG || configuredTag;
}

const environment = normalizeEnvironment(
  readArg("--environment", process.env.RELEASE_ENV || process.env.BUILD_ENV || process.env.ADMIN_INGEST_ENV || "prod")
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const adminReleaseConfig = JSON.parse(readFileSync(ADMIN_RELEASE_CONFIG_PATH, "utf8"));
const commit = process.env.RELEASE_HEAD || git(["rev-parse", "HEAD"]);

if (!commit) {
  console.error("RELEASE_VERSION_ERROR: git rev-parse HEAD returned empty commit");
  process.exit(1);
}

const branch =
  process.env.GITHUB_REF_TYPE === "branch" && process.env.GITHUB_REF_NAME
    ? process.env.GITHUB_REF_NAME
    : git(["branch", "--show-current"], "detached");
const buildNumber = process.env.ADMIN_INGEST_BUILD || adminReleaseConfig.build;
const shortCommit = commit.slice(0, 8);
const webUrl = process.env.ADMIN_INGEST_WEB_URL || adminReleaseConfig.web_url || DEFAULT_WEB_URLS[environment];
const version = process.env.ADMIN_INGEST_VERSION || adminReleaseConfig.version || packageJson.version || "0.0.0";
const configuredTag =
  adminReleaseConfig.release_tag || `release/admin-ingest-${version}-build.${buildNumber}`;
const tag = resolveTag(configuredTag);
const github = buildGithubUrls(resolveGithubRepo());
const encodedTag = encodeURIComponent(tag);

const releaseInfo = {
  app: "admin-ingest",
  version,
  environment,
  commit,
  shortCommit,
  branch,
  tag,
  buildNumber: String(buildNumber),
  buildTime: new Date().toISOString(),
  webUrl,
  github,
  githubOwner: github.owner,
  githubRepo: github.repo,
  repository: github.repository,
  releaseUrl: `${github.repoUrl}/releases/tag/${encodedTag}`,
  apkAssetName: adminReleaseConfig.apk_asset,
  exeAssetName: adminReleaseConfig.exe_asset,
  apkDownloadUrl: `${github.repoUrl}/releases/download/${encodedTag}/${adminReleaseConfig.apk_asset}`,
  exeDownloadUrl: `${github.repoUrl}/releases/download/${encodedTag}/${adminReleaseConfig.exe_asset}`,
  latestApkUrl: adminReleaseConfig.apk_url,
  latestExeUrl: adminReleaseConfig.exe_url,
  artifactPrefix: `admin-ingest-${version}-${buildNumber}-${shortCommit}`,
  rollback: {
    previousHead: process.env.ROLLBACK_PREVIOUS_HEAD || null,
    previousTag: process.env.ROLLBACK_PREVIOUS_TAG || null
  }
};

console.log(JSON.stringify(releaseInfo, null, 2));

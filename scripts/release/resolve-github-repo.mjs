import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

export function parseGithubRemote(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2].replace(/\.git$/i, "")
    };
  }

  const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2].replace(/\.git$/i, "")
    };
  }

  return null;
}

export function resolveGithubRepo() {
  const explicit = readArg("--repo", process.env.GITHUB_REPOSITORY || "");
  if (explicit && explicit.includes("/")) {
    const [owner, repo] = explicit.split("/");
    if (owner && repo) {
      return { owner, repo };
    }
  }

  const remoteName = readArg("--remote", process.env.GITHUB_REMOTE || "origin");
  const remoteUrl = git(["remote", "get-url", remoteName]);
  const parsed = parseGithubRemote(remoteUrl);
  if (parsed) {
    return parsed;
  }

  throw new Error(`GITHUB_REPO_NOT_DETECTED: cannot parse remote ${remoteName || "origin"} (${remoteUrl || "empty"})`);
}

export function buildGithubUrls(input) {
  const { owner, repo } = input;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  return {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    repoUrl,
    releasesUrl: `${repoUrl}/releases`,
    actionsUrl: `${repoUrl}/actions`,
    latestApkUrl: `${repoUrl}/releases/latest/download/admin-ingest.apk`,
    latestExeUrl: `${repoUrl}/releases/latest/download/admin-ingest.exe`
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(JSON.stringify(buildGithubUrls(resolveGithubRepo()), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

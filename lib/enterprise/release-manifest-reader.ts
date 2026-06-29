import "server-only";

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReleaseArtifact, ReleaseEnvironment } from "@/lib/enterprise/release-console-types";

const DEFAULT_WEB_URLS: Record<ReleaseEnvironment, string | null> = {
  dev: "http://localhost:3063/admin-ingest?app=ingest-admin&platform=web",
  staging: null,
  prod: "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=web"
};

function readJsonFile(path: string) {
  const target = resolve(process.cwd(), path);

  if (!existsSync(target)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(target, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readReleaseManifest() {
  return readJsonFile("artifacts/admin-ingest/release-manifest.json");
}

export function readPublicLatestManifest() {
  return readJsonFile("public/releases/latest.json");
}

export function readBuildId() {
  const target = resolve(process.cwd(), ".next/BUILD_ID");

  if (!existsSync(target)) {
    return null;
  }

  return readFileSync(target, "utf8").trim() || null;
}

export function git(args: string[], fallback: string | null = null) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeReleaseArtifact(
  platform: ReleaseArtifact["platform"],
  value: unknown,
  fallbackHead: string | null
): ReleaseArtifact {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const available = record.available === true;

  return {
    platform,
    available,
    head: readString(record.head) ?? readString(record.commit) ?? fallbackHead,
    path: readString(record.path),
    url: readString(record.url) ?? readString(record.webUrl),
    buildId: readString(record.buildId),
    size: readNumber(record.size),
    sha256: readString(record.sha256),
    reason: readString(record.reason) ?? (available ? null : `${platform.toUpperCase()}_ARTIFACT_NOT_AVAILABLE`),
    buildTime: readString(record.buildTime),
    tag: readString(record.tag)
  };
}

export function resolveReleaseEnvironment(value: string | null | undefined): ReleaseEnvironment {
  const normalized = String(value ?? process.env.RELEASE_ENV ?? process.env.ADMIN_INGEST_ENV ?? "prod").toLowerCase();

  if (["dev", "development", "local"].includes(normalized)) {
    return "dev";
  }

  if (["stage", "staging", "qa", "test"].includes(normalized)) {
    return "staging";
  }

  return "prod";
}

export function getDefaultWebUrl(environment: ReleaseEnvironment) {
  return process.env.ADMIN_INGEST_WEB_URL || DEFAULT_WEB_URLS[environment];
}

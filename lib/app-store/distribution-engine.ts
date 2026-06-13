import type { AppStorePlatform } from "./app-registry";
import {
  getActiveVersion,
  listVersions,
  type AppStoreApplication,
  type AppStoreChannel,
  type AppStoreVersion
} from "./version-catalog";

export type UserSegment = AppStoreChannel;

export interface DistributionContext {
  userId: string;
  platform: AppStorePlatform;
}

export interface DistributionDecision {
  bucket: number;
  segment: UserSegment;
  channel: AppStoreChannel;
  version: AppStoreVersion | null;
}

export interface DistributedDownload {
  version: AppStoreVersion;
  url: string;
  platform: AppStorePlatform;
}

const channelFallbacks: Record<AppStoreChannel, AppStoreChannel[]> = {
  canary: ["canary", "beta", "stable"],
  beta: ["beta", "stable"],
  stable: ["stable"]
};

export function hashUserId(userId: string) {
  const source = userId.trim() || "anonymous";
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getUserBucket(userId: string) {
  return hashUserId(userId) % 100;
}

export function getUserSegment(userId: string): UserSegment {
  const bucket = getUserBucket(userId);

  if (bucket <= 9) {
    return "canary";
  }

  if (bucket <= 49) {
    return "beta";
  }

  return "stable";
}

export function getDistributionChannel(context: DistributionContext): AppStoreChannel {
  if (context.platform === "windows" || context.platform === "web" || context.platform === "electron") {
    return "stable";
  }

  return getUserSegment(context.userId);
}

export function isRolloutEligible(version: Pick<AppStoreVersion, "rollout">, bucket: number) {
  return version.rollout >= 100 || bucket < version.rollout;
}

function getActiveVersionCeiling(app: AppStoreApplication) {
  return getActiveVersion(app)?.build ?? Number.MAX_SAFE_INTEGER;
}

function getCandidateVersions(app: AppStoreApplication) {
  const activeBuild = getActiveVersionCeiling(app);

  return listVersions(app).filter((version) => version.build <= activeBuild);
}

export function resolveDistributedVersion(app: AppStoreApplication, context: DistributionContext): DistributionDecision {
  const bucket = getUserBucket(context.userId);
  const segment = getUserSegment(context.userId);
  const channel = getDistributionChannel(context);
  const candidates = getCandidateVersions(app);

  for (const candidateChannel of channelFallbacks[channel]) {
    const version = candidates.find((candidate) =>
      candidate.channel === candidateChannel && isRolloutEligible(candidate, bucket)
    );

    if (version) {
      return {
        bucket,
        segment,
        channel: candidateChannel,
        version
      };
    }
  }

  return {
    bucket,
    segment,
    channel: "stable",
    version: candidates.find((candidate) => candidate.channel === "stable") ?? candidates[0] ?? null
  };
}

export function resolveDistributedDownload(app: AppStoreApplication, context: DistributionContext): DistributedDownload | null {
  const decision = resolveDistributedVersion(app, context);
  const version = decision.version;

  if (!version) {
    return null;
  }

  if (context.platform === "android") {
    return { version, platform: context.platform, url: version.apk_url || version.download_page || version.web_url };
  }

  if (context.platform === "windows" || context.platform === "electron") {
    return { version, platform: context.platform, url: version.exe_url || version.download_page || version.web_url };
  }

  if (context.platform === "web") {
    return { version, platform: context.platform, url: version.web_url || version.download_page };
  }

  return { version, platform: context.platform, url: version.download_page || version.web_url };
}

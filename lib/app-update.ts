import type { AppKind } from "./app-version";
import {
  detectPlatform,
  resolveDownload,
  type UpdateDownloadTarget,
  type UpdatePlatform
} from "./update-core";
import {
  evaluateUpdatePolicy,
  getAppReleaseSnapshot,
  normalizeAppStoreManifest,
  resolveDistributedVersion,
  type AppStoreManifest,
  type AppStorePlatform
} from "./app-store";

export type AppPlatform = UpdatePlatform;

export interface AppReleaseInfo {
  app_name: string;
  version: string;
  build: number;
  minimum_build: number;
  force_update: boolean;
  web_url: string;
  apk_url: string;
  exe_url: string;
  download_page: string;
  changelog: string[];
}

export interface LatestReleaseManifest {
  updated_at: string;
  user: AppReleaseInfo;
  admin: AppReleaseInfo;
}

export interface AppUpdateResult {
  appKind: AppKind;
  currentVersion: string;
  currentBuild: number;
  hasUpdate: boolean;
  forceUpdate: boolean;
  latest: AppReleaseInfo | null;
  updatedAt: string | null;
}

export type AppUpdateTarget = UpdateDownloadTarget;

interface CheckAppUpdateOptions {
  appKind: AppKind;
  currentVersion: string;
  currentBuild: number;
  userId?: string;
  platform?: AppPlatform;
  manifestUrl?: string;
  fetcher?: typeof fetch;
}

interface UpdateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_MANIFEST_URL = "/releases/latest.json";
const UPDATE_SNOOZE_MS = 12 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getBoolean(value: unknown) {
  return value === true;
}

function getAliasValue(value: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in value) {
      return value[key];
    }
  }

  return undefined;
}

function normalizeReleaseInfo(value: unknown): AppReleaseInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const download = isRecord(value.download) ? value.download : {};
  const changelog = Array.isArray(value.changelog)
    ? value.changelog.filter((item): item is string => typeof item === "string")
    : [];
  const build = getNumber(value.build);
  const minimumBuild = getNumber(getAliasValue(value, "minimum_build", "minimumBuild")) || build;

  return {
    app_name: getString(value.app_name),
    version: getString(value.version),
    build,
    minimum_build: minimumBuild,
    force_update: getBoolean(getAliasValue(value, "force_update", "forceUpdate")),
    web_url: getString(getAliasValue(value, "web_url", "webUrl")) || getString(download.web),
    apk_url: getString(getAliasValue(value, "apk_url", "apkUrl")) || getString(download.android),
    exe_url: getString(getAliasValue(value, "exe_url", "exeUrl")) || getString(download.windows),
    download_page: getString(getAliasValue(value, "download_page", "downloadPage")) || getString(download.page),
    changelog
  };
}

function normalizeSingleSourceManifest(value: unknown): LatestReleaseManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = getString(value.version);
  const build = getNumber(value.build);

  if (!version || build <= 0) {
    return null;
  }

  const download = isRecord(value.download) ? value.download : {};
  const forceUpdate = getBoolean(getAliasValue(value, "force_update", "forceUpdate"));
  const minimumBuild = getNumber(getAliasValue(value, "minimum_build", "minimumBuild")) || build;
  const changelog = Array.isArray(value.changelog)
    ? value.changelog.filter((item): item is string => typeof item === "string")
    : [];
  const webUrl = getString(getAliasValue(value, "web_url", "webUrl")) || getString(download.web);
  const apkUrl = getString(getAliasValue(value, "apk_url", "apkUrl")) || getString(download.android);
  const exeUrl = getString(getAliasValue(value, "exe_url", "exeUrl")) || getString(download.windows);
  const downloadPage = getString(getAliasValue(value, "download_page", "downloadPage")) || getString(download.page) || webUrl;

  const baseRelease = {
    version,
    build,
    minimum_build: minimumBuild,
    force_update: forceUpdate,
    web_url: webUrl,
    apk_url: apkUrl,
    exe_url: exeUrl,
    download_page: downloadPage,
    changelog
  };

  return {
    updated_at: getString(value.updated_at) || getString(value.updatedAt),
    user: {
      app_name: "AI知识库助手",
      ...baseRelease
    },
    admin: {
      app_name: "AI知识库管理后台",
      ...baseRelease
    }
  };
}

function toAppStorePlatform(platform: AppPlatform): AppStorePlatform {
  if (platform === "android"
    || platform === "windows"
    || platform === "ios"
    || platform === "macos"
    || platform === "web"
    || platform === "electron") {
    return platform;
  }

  return "web";
}

function getDistributedReleaseInfo(
  manifest: AppStoreManifest,
  appKind: AppKind,
  options?: Pick<CheckAppUpdateOptions, "userId" | "platform">
) {
  const app = manifest.apps[appKind];

  if (!app) {
    return null;
  }

  const decision = resolveDistributedVersion(app, {
    userId: options?.userId ?? "anonymous",
    platform: toAppStorePlatform(options?.platform ?? detectAppPlatform())
  });

  return getAppReleaseSnapshot(app, decision.version ?? undefined);
}

function normalizeAppStoreLatestManifest(
  value: unknown,
  options?: Pick<CheckAppUpdateOptions, "appKind" | "userId" | "platform">
): LatestReleaseManifest | null {
  const manifest = normalizeAppStoreManifest(value);

  if (!manifest) {
    return null;
  }

  const user = getDistributedReleaseInfo(manifest, "user", options);
  const admin = getDistributedReleaseInfo(manifest, "admin", options);

  if (!user || !admin) {
    return null;
  }

  return {
    updated_at: manifest.updated_at,
    user,
    admin
  };
}

export function normalizeLatestReleaseManifest(
  value: unknown,
  options?: Pick<CheckAppUpdateOptions, "appKind" | "userId" | "platform">
): LatestReleaseManifest | null {
  const appStoreManifest = normalizeAppStoreLatestManifest(value, options);

  if (appStoreManifest) {
    return appStoreManifest;
  }

  const singleSourceManifest = normalizeSingleSourceManifest(value);

  if (singleSourceManifest) {
    return singleSourceManifest;
  }

  if (!isRecord(value)) {
    return null;
  }

  const user = normalizeReleaseInfo(value.user);
  const admin = normalizeReleaseInfo(value.admin);

  if (!user || !admin) {
    return null;
  }

  return {
    updated_at: getString(value.updated_at),
    user,
    admin
  };
}

function getEmptyResult(options: CheckAppUpdateOptions): AppUpdateResult {
  return {
    appKind: options.appKind,
    currentVersion: options.currentVersion,
    currentBuild: options.currentBuild,
    hasUpdate: false,
    forceUpdate: false,
    latest: null,
    updatedAt: null
  };
}

export async function checkAppUpdate(options: CheckAppUpdateOptions): Promise<AppUpdateResult> {
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    return getEmptyResult(options);
  }

  try {
    const response = await fetcher(options.manifestUrl ?? DEFAULT_MANIFEST_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      return getEmptyResult(options);
    }

    const manifest = normalizeLatestReleaseManifest(await response.json(), {
      appKind: options.appKind,
      userId: options.userId,
      platform: options.platform
    });

    if (!manifest) {
      return getEmptyResult(options);
    }

    const latest = manifest[options.appKind];
    const policy = evaluateUpdatePolicy({
      currentBuild: options.currentBuild,
      release: latest
    });

    return {
      appKind: options.appKind,
      currentVersion: options.currentVersion,
      currentBuild: options.currentBuild,
      hasUpdate: policy.hasUpdate,
      forceUpdate: policy.forceUpdate,
      latest,
      updatedAt: manifest.updated_at
    };
  } catch {
    return getEmptyResult(options);
  }
}

export function detectAppPlatform(userAgent?: string): AppPlatform {
  return detectPlatform(userAgent);
}

export function resolveUpdateTarget(
  release: AppReleaseInfo,
  appKind: AppKind,
  platform = detectAppPlatform()
): AppUpdateTarget {
  return resolveDownload(release, appKind, platform);
}

export function resolveUpdateUrl(release: AppReleaseInfo, platform: AppPlatform) {
  return resolveDownload(release, "user", platform).url;
}

export function canDismissUpdate(update: Pick<AppUpdateResult, "hasUpdate" | "forceUpdate">) {
  return update.hasUpdate && !update.forceUpdate;
}

export function getUpdateSnoozeKey(appKind: AppKind, latestBuild: number) {
  return `app-update-snoozed:${appKind}:${latestBuild}`;
}

export function shouldSkipUpdateNotice(
  appKind: AppKind,
  latestBuild: number,
  storage: UpdateStorage | undefined,
  now = Date.now()
) {
  if (!storage) {
    return false;
  }

  const rawValue = storage.getItem(getUpdateSnoozeKey(appKind, latestBuild));
  const snoozedUntil = rawValue ? Number(rawValue) : 0;

  return Number.isFinite(snoozedUntil) && snoozedUntil > now;
}

export function snoozeUpdateNotice(
  appKind: AppKind,
  latestBuild: number,
  storage: UpdateStorage | undefined,
  now = Date.now()
) {
  if (!storage) {
    return;
  }

  storage.setItem(getUpdateSnoozeKey(appKind, latestBuild), String(now + UPDATE_SNOOZE_MS));
}

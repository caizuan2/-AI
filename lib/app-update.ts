import type { AppKind } from "./app-version";

export type AppPlatform = "android" | "windows" | "web" | "unknown";

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

interface CheckAppUpdateOptions {
  appKind: AppKind;
  currentVersion: string;
  currentBuild: number;
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

function normalizeReleaseInfo(value: unknown): AppReleaseInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const changelog = Array.isArray(value.changelog)
    ? value.changelog.filter((item): item is string => typeof item === "string")
    : [];

  return {
    app_name: getString(value.app_name),
    version: getString(value.version),
    build: getNumber(value.build),
    minimum_build: getNumber(value.minimum_build),
    force_update: value.force_update === true,
    web_url: getString(value.web_url),
    apk_url: getString(value.apk_url),
    exe_url: getString(value.exe_url),
    download_page: getString(value.download_page),
    changelog
  };
}

export function normalizeLatestReleaseManifest(value: unknown): LatestReleaseManifest | null {
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

    const manifest = normalizeLatestReleaseManifest(await response.json());

    if (!manifest) {
      return getEmptyResult(options);
    }

    const latest = manifest[options.appKind];
    const hasUpdate = latest.build > options.currentBuild;
    const forceUpdate = hasUpdate && (latest.force_update || options.currentBuild < latest.minimum_build);

    return {
      appKind: options.appKind,
      currentVersion: options.currentVersion,
      currentBuild: options.currentBuild,
      hasUpdate,
      forceUpdate,
      latest,
      updatedAt: manifest.updated_at
    };
  } catch {
    return getEmptyResult(options);
  }
}

export function detectAppPlatform(userAgent?: string): AppPlatform {
  const agent = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  if (!agent.trim()) {
    return "unknown";
  }

  if (/Android/i.test(agent)) {
    return "android";
  }

  if (/Electron/i.test(agent) && /Windows|Win32|Win64|Windows NT/i.test(agent)) {
    return "windows";
  }

  if (/Mozilla|Chrome|Safari|Firefox|Edg/i.test(agent)) {
    return "web";
  }

  return "unknown";
}

export function resolveUpdateUrl(release: AppReleaseInfo, platform: AppPlatform) {
  if (platform === "android") {
    return release.apk_url || release.download_page;
  }

  if (platform === "windows") {
    return release.exe_url || release.download_page;
  }

  if (platform === "web") {
    return release.web_url || release.download_page;
  }

  return release.download_page;
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

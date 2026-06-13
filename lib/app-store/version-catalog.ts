import type { AppRegistryEntry, AppStorePlatform } from "./app-registry";

export type AppStoreChannel = "canary" | "beta" | "stable";

export interface AppStoreVersion {
  version: string;
  build: number;
  channel: AppStoreChannel;
  rollout: number;
  minimum_build: number;
  force_update: boolean;
  web_url: string;
  apk_url: string;
  exe_url: string;
  download_page: string;
  changelog: string[];
  created_at: string;
}

export interface AppStoreApplication {
  id: string;
  name: string;
  platforms: AppStorePlatform[];
  versions: AppStoreVersion[];
  active_version: string;
}

export interface AppStoreManifest {
  updated_at: string;
  apps: Record<string, AppStoreApplication>;
}

export interface AppReleaseSnapshot {
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

function normalizeRollout(value: unknown) {
  const rollout = getNumber(value);

  if (rollout <= 0) {
    return 0;
  }

  if (rollout >= 100) {
    return 100;
  }

  return Math.round(rollout);
}

function normalizeChannel(value: unknown): AppStoreChannel {
  return value === "canary" || value === "beta" || value === "stable" ? value : "stable";
}

function normalizePlatforms(value: unknown): AppStorePlatform[] {
  if (!Array.isArray(value)) {
    return ["android", "windows", "web", "electron"];
  }

  return value.filter((item): item is AppStorePlatform =>
    item === "android"
    || item === "windows"
    || item === "ios"
    || item === "macos"
    || item === "web"
    || item === "electron"
  );
}

export function normalizeAppStoreVersion(value: unknown): AppStoreVersion | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = getString(value.version);
  const build = getNumber(value.build);

  if (!version || build <= 0) {
    return null;
  }

  return {
    version,
    build,
    channel: normalizeChannel(value.channel),
    rollout: normalizeRollout(value.rollout),
    minimum_build: getNumber(value.minimum_build),
    force_update: getBoolean(value.force_update),
    web_url: getString(value.web_url),
    apk_url: getString(value.apk_url),
    exe_url: getString(value.exe_url),
    download_page: getString(value.download_page),
    changelog: Array.isArray(value.changelog)
      ? value.changelog.filter((item): item is string => typeof item === "string")
      : [],
    created_at: getString(value.created_at)
  };
}

export function normalizeAppStoreApplication(value: unknown): AppStoreApplication | null {
  if (!isRecord(value)) {
    return null;
  }

  const versions = Array.isArray(value.versions)
    ? value.versions.map(normalizeAppStoreVersion).filter((item): item is AppStoreVersion => Boolean(item))
    : [];

  if (versions.length === 0) {
    return null;
  }

  return {
    id: getString(value.id),
    name: getString(value.name),
    platforms: normalizePlatforms(value.platforms),
    versions: listVersions(versions),
    active_version: getString(value.active_version) || versions[0]?.version || ""
  };
}

export function normalizeAppStoreManifest(value: unknown): AppStoreManifest | null {
  if (!isRecord(value) || !isRecord(value.apps)) {
    return null;
  }

  const apps = Object.entries(value.apps).reduce<Record<string, AppStoreApplication>>((current, [key, app]) => {
    const normalized = normalizeAppStoreApplication(app);

    if (normalized) {
      current[key] = normalized;
    }

    return current;
  }, {});

  if (Object.keys(apps).length === 0) {
    return null;
  }

  return {
    updated_at: getString(value.updated_at),
    apps
  };
}

export function listVersions(versionsOrApp: AppStoreVersion[] | AppStoreApplication) {
  const versions = Array.isArray(versionsOrApp) ? versionsOrApp : versionsOrApp.versions;

  return [...versions].sort((left, right) => {
    if (right.build !== left.build) {
      return right.build - left.build;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

export function getActiveVersion(app: AppStoreApplication) {
  return app.versions.find((version) => version.version === app.active_version)
    ?? getLatestVersion(app, "stable")
    ?? listVersions(app)[0]
    ?? null;
}

export function getLatestVersion(app: AppStoreApplication, channel?: AppStoreChannel) {
  return listVersions(app).find((version) => !channel || version.channel === channel) ?? null;
}

export function buildAppCatalog(entry: AppRegistryEntry, versions: AppStoreVersion[], activeVersion: string): AppStoreApplication {
  return {
    id: entry.id,
    name: entry.name,
    platforms: [...entry.platforms],
    versions: listVersions(versions),
    active_version: activeVersion
  };
}

export function addVersion(app: AppStoreApplication, version: AppStoreVersion, activate = true): AppStoreApplication {
  const versions = [
    version,
    ...app.versions.filter((item) => item.version !== version.version && item.build !== version.build)
  ];

  return {
    ...app,
    versions: listVersions(versions),
    active_version: activate ? version.version : app.active_version
  };
}

export function getAppReleaseSnapshot(app: AppStoreApplication, version = getActiveVersion(app)): AppReleaseSnapshot | null {
  if (!version) {
    return null;
  }

  return {
    app_name: app.name,
    version: version.version,
    build: version.build,
    minimum_build: version.minimum_build,
    force_update: version.force_update,
    web_url: version.web_url,
    apk_url: version.apk_url,
    exe_url: version.exe_url,
    download_page: version.download_page,
    changelog: [...version.changelog]
  };
}

export function getManifestAppReleaseSnapshot(manifest: AppStoreManifest, appKey: string) {
  const app = manifest.apps[appKey];

  return app ? getAppReleaseSnapshot(app) : null;
}

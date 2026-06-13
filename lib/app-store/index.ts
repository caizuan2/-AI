export * from "./app-registry";
export * from "./version-catalog";
export * from "./distribution-engine";
export * from "./update-policy";
export * from "./rollback-service";

import { getManifestAppReleaseSnapshot, type AppReleaseSnapshot, type AppStoreManifest } from "./version-catalog";

export const userVersion = {
  version: "1.0.6",
  build: 106
};

export const adminVersion = {
  version: "1.0.6",
  build: 106
};

export const appVersions = {
  user: userVersion,
  admin: adminVersion
};

export function getAppVersion(): typeof appVersions;
export function getAppVersion(appKey: keyof typeof appVersions): (typeof appVersions)[keyof typeof appVersions];
export function getAppVersion(appKey: keyof typeof appVersions, manifest: AppStoreManifest): AppReleaseSnapshot | null;
export function getAppVersion(appKey?: keyof typeof appVersions, manifest?: AppStoreManifest) {
  if (manifest && appKey) {
    return getManifestAppReleaseSnapshot(manifest, appKey);
  }

  if (appKey) {
    return appVersions[appKey];
  }

  return appVersions;
}

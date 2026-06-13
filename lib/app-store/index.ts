export * from "./app-registry";
export * from "./version-catalog";
export * from "./distribution-engine";
export * from "./update-policy";
export * from "./rollback-service";

import { getManifestAppReleaseSnapshot, type AppReleaseSnapshot, type AppStoreManifest } from "./version-catalog";
import versionInfo from "../../version.json";

export const userVersion = {
  version: versionInfo.version,
  build: versionInfo.build
};

export const adminVersion = {
  version: versionInfo.version,
  build: versionInfo.build
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

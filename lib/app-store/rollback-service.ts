import type { AppStoreManifest } from "./version-catalog";

function cloneManifest(manifest: AppStoreManifest): AppStoreManifest {
  return {
    updated_at: manifest.updated_at,
    apps: Object.fromEntries(
      Object.entries(manifest.apps).map(([key, app]) => [
        key,
        {
          ...app,
          platforms: [...app.platforms],
          versions: app.versions.map((version) => ({
            ...version,
            changelog: [...version.changelog]
          }))
        }
      ])
    )
  };
}

export function rollbackToVersion(
  manifest: AppStoreManifest,
  appKey: string,
  version: string,
  updatedAt = new Date().toISOString()
): AppStoreManifest {
  const app = manifest.apps[appKey];

  if (!app) {
    throw new Error(`Unknown app: ${appKey}`);
  }

  if (!app.versions.some((item) => item.version === version)) {
    throw new Error(`Version ${version} was not found for app ${appKey}.`);
  }

  const nextManifest = cloneManifest(manifest);

  nextManifest.updated_at = updatedAt;
  nextManifest.apps[appKey] = {
    ...nextManifest.apps[appKey],
    active_version: version
  };

  return nextManifest;
}

export function rollbackToBuild(
  manifest: AppStoreManifest,
  appKey: string,
  build: number,
  updatedAt = new Date().toISOString()
) {
  const app = manifest.apps[appKey];
  const version = app?.versions.find((item) => item.build === build);

  if (!version) {
    throw new Error(`Build ${build} was not found for app ${appKey}.`);
  }

  return rollbackToVersion(manifest, appKey, version.version, updatedAt);
}

export const rollbackService = {
  rollbackToVersion,
  rollbackToBuild
};

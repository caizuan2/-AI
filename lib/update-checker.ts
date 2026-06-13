import {
  checkAppUpdate,
  detectAppPlatform,
  type AppPlatform,
  type AppUpdateResult
} from "./app-update";
import { APP_BUILD, APP_VERSION, type AppKind } from "./app-version";

interface CheckCurrentAppUpdateOptions {
  appKind: AppKind;
  currentVersion?: string;
  currentBuild?: number;
  userId?: string;
  platform?: AppPlatform;
  manifestUrl?: string;
  fetcher?: typeof fetch;
}

export interface CurrentAppVersion {
  version: string;
  build: number;
}

export function getCurrentAppVersion(): CurrentAppVersion {
  return {
    version: APP_VERSION,
    build: APP_BUILD
  };
}

export function getCurrentAppPlatform(userAgent?: string): AppPlatform {
  return detectAppPlatform(userAgent);
}

export async function checkCurrentAppUpdate(options: CheckCurrentAppUpdateOptions): Promise<AppUpdateResult> {
  const current = getCurrentAppVersion();

  return checkAppUpdate({
    appKind: options.appKind,
    currentVersion: options.currentVersion ?? current.version,
    currentBuild: options.currentBuild ?? current.build,
    userId: options.userId,
    platform: options.platform,
    manifestUrl: options.manifestUrl,
    fetcher: options.fetcher
  });
}

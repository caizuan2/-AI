import {
  checkAppUpdate,
  detectAppPlatform,
  type AppPlatform,
  type AppUpdateResult
} from "./app-update";
import { APP_BUILD, APP_VERSION, APP_WEB_RELEASE_SHA, type AppKind } from "./app-version";

interface CheckCurrentAppUpdateOptions {
  appKind: AppKind;
  currentVersion?: string;
  currentBuild?: number;
  currentWebReleaseSha?: string;
  userId?: string;
  platform?: AppPlatform;
  manifestUrl?: string;
  fetcher?: typeof fetch;
}

export interface CurrentAppVersion {
  version: string;
  build: number;
  webReleaseSha: string;
}

export function getCurrentAppVersion(): CurrentAppVersion {
  return {
    version: APP_VERSION,
    build: APP_BUILD,
    webReleaseSha: APP_WEB_RELEASE_SHA
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
    currentWebReleaseSha: options.currentWebReleaseSha ?? current.webReleaseSha,
    userId: options.userId,
    platform: options.platform,
    manifestUrl: options.manifestUrl,
    fetcher: options.fetcher
  });
}

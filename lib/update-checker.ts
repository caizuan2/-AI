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
  runtimeWindow?: RuntimeWindowLike;
  search?: string;
  storage?: RuntimeStorageLike;
  userAgent?: string;
}

export interface CurrentAppVersion {
  version: string;
  build: number;
  webReleaseSha: string;
}

interface RuntimeStorageLike {
  getItem: (key: string) => string | null;
}

interface RuntimeWindowLike {
  location?: { search?: string };
  navigator?: { userAgent?: string };
  localStorage?: RuntimeStorageLike;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    platform?: string;
  };
  AndroidBridge?: unknown;
  electron?: unknown;
  aiKnowledge?: {
    appVersion?: string;
    appBuild?: number | string;
    version?: string;
    build?: number | string;
  };
  __AI_KNOWLEDGE_APP_VERSION__?: {
    version?: string;
    build?: number | string;
    webReleaseSha?: string;
  };
}

interface GetCurrentAppVersionOptions {
  runtimeWindow?: RuntimeWindowLike;
  search?: string;
  storage?: RuntimeStorageLike;
  userAgent?: string;
}

const BUILD_PARAM_KEYS = ["shellBuild", "nativeBuild", "appBuild", "versionCode", "buildCode"];
const VERSION_PARAM_KEYS = ["shellVersion", "nativeVersion", "appVersion", "versionName"];
const WEB_SHA_PARAM_KEYS = ["shellWebReleaseSha", "webReleaseSha", "web_release_sha"];
const BUILD_STORAGE_KEYS = ["ai_knowledge_shell_build", "shellBuild", "nativeBuild", "appBuild"];
const VERSION_STORAGE_KEYS = ["ai_knowledge_shell_version", "shellVersion", "nativeVersion", "appVersion"];

function getBrowserWindow(): RuntimeWindowLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as unknown as RuntimeWindowLike;
}

function normalizeSearch(search?: string): URLSearchParams | null {
  if (!search) {
    return null;
  }

  try {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
}

function readFirstParam(search: URLSearchParams | null, keys: string[]): string | undefined {
  if (!search) {
    return undefined;
  }

  for (const key of keys) {
    const value = search.get(key);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function readFirstStorage(storage: RuntimeStorageLike | undefined, keys: string[]): string | undefined {
  if (!storage) {
    return undefined;
  }

  for (const key of keys) {
    try {
      const value = storage.getItem(key);

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    } catch {
      // Ignore blocked storage in old WebView shells.
    }
  }

  return undefined;
}

function toPositiveBuild(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function toVersionString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function detectNativeShell(runtimeWindow: RuntimeWindowLike | undefined, userAgent: string): boolean {
  if (!runtimeWindow) {
    return false;
  }

  try {
    if (typeof runtimeWindow.Capacitor?.isNativePlatform === "function" && runtimeWindow.Capacitor.isNativePlatform()) {
      return true;
    }
  } catch {
    // Continue with other shell markers.
  }

  try {
    const platform =
      typeof runtimeWindow.Capacitor?.getPlatform === "function"
        ? runtimeWindow.Capacitor.getPlatform()
        : runtimeWindow.Capacitor?.platform;

    if (platform && platform !== "web") {
      return true;
    }
  } catch {
    // Continue with other shell markers.
  }

  if (runtimeWindow.AndroidBridge || runtimeWindow.electron || runtimeWindow.aiKnowledge) {
    return true;
  }

  return /Electron/i.test(userAgent);
}

export function getCurrentAppVersion(options: GetCurrentAppVersionOptions = {}): CurrentAppVersion {
  const runtimeWindow = options.runtimeWindow ?? getBrowserWindow();
  const search = normalizeSearch(options.search ?? runtimeWindow?.location?.search);
  const storage = options.storage ?? runtimeWindow?.localStorage;
  const userAgent = options.userAgent ?? runtimeWindow?.navigator?.userAgent ?? "";
  const injected = runtimeWindow?.__AI_KNOWLEDGE_APP_VERSION__;
  const aiKnowledge = runtimeWindow?.aiKnowledge;
  const explicitVersion =
    toVersionString(injected?.version) ??
    toVersionString(aiKnowledge?.appVersion) ??
    toVersionString(aiKnowledge?.version) ??
    readFirstParam(search, VERSION_PARAM_KEYS) ??
    readFirstStorage(storage, VERSION_STORAGE_KEYS);
  const explicitBuild =
    toPositiveBuild(injected?.build) ??
    toPositiveBuild(aiKnowledge?.appBuild) ??
    toPositiveBuild(aiKnowledge?.build) ??
    toPositiveBuild(readFirstParam(search, BUILD_PARAM_KEYS)) ??
    toPositiveBuild(readFirstStorage(storage, BUILD_STORAGE_KEYS));
  const explicitWebReleaseSha =
    toVersionString(injected?.webReleaseSha) ?? readFirstParam(search, WEB_SHA_PARAM_KEYS);
  const nativeShell = detectNativeShell(runtimeWindow, userAgent);
  const legacyNativeShell = nativeShell && !explicitBuild && !explicitVersion;
  const staleNativeVersion = nativeShell && !explicitBuild && explicitVersion && explicitVersion !== APP_VERSION;

  return {
    version: explicitVersion ?? (legacyNativeShell ? "旧安装包" : APP_VERSION),
    build: explicitBuild ?? (legacyNativeShell || staleNativeVersion ? 0 : APP_BUILD),
    webReleaseSha: explicitWebReleaseSha ?? APP_WEB_RELEASE_SHA
  };
}

export function getCurrentAppPlatform(userAgent?: string): AppPlatform {
  return detectAppPlatform(userAgent);
}

export async function checkCurrentAppUpdate(options: CheckCurrentAppUpdateOptions): Promise<AppUpdateResult> {
  const current = getCurrentAppVersion({
    runtimeWindow: options.runtimeWindow,
    search: options.search,
    storage: options.storage,
    userAgent: options.userAgent
  });

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

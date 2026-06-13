export type UpdatePlatform = "android" | "windows" | "ios" | "macos" | "web" | "electron" | "unknown";
export type UpdateAppKind = "user" | "admin";

export interface UpdateReleaseInfo {
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

export interface UpdateDownloadTarget {
  url: string;
  platform: UpdatePlatform;
  label: string;
}

export interface DetectPlatformOptions {
  userAgent?: string;
  capacitor?: {
    getPlatform?: () => string;
    platform?: string;
  };
}

export interface LinkWindowLike {
  AndroidBridge?: {
    openUrl?: (url: string) => unknown;
  };
  electron?: {
    openExternal?: (url: string) => unknown;
    shell?: {
      openExternal?: (url: string) => unknown;
    };
  };
  aiKnowledge?: {
    openExternal?: (url: string) => unknown;
  };
  open?: (url: string, target: string) => { opener?: unknown } | null;
  location?: {
    href: string;
    assign?: (url: string) => void;
  };
}

const platformLabels: Record<UpdatePlatform, string> = {
  android: "Android APK",
  windows: "Windows EXE",
  ios: "iOS download page",
  macos: "macOS download page",
  web: "Web app",
  electron: "Electron app",
  unknown: "download page"
};

function normalizePlatform(value: string | undefined): UpdatePlatform | null {
  const platform = value?.toLowerCase();

  if (
    platform === "android"
    || platform === "windows"
    || platform === "ios"
    || platform === "macos"
    || platform === "web"
    || platform === "electron"
  ) {
    return platform;
  }

  if (platform === "mac") {
    return "macos";
  }

  return null;
}

function getGlobalCapacitor(): DetectPlatformOptions["capacitor"] | undefined {
  return (globalThis as typeof globalThis & { Capacitor?: DetectPlatformOptions["capacitor"] }).Capacitor;
}

export function detectPlatform(options?: string | DetectPlatformOptions): UpdatePlatform {
  const userAgent = typeof options === "string" ? options : options?.userAgent;
  const capacitor = typeof options === "string" ? getGlobalCapacitor() : options?.capacitor ?? getGlobalCapacitor();

  if (capacitor) {
    try {
      const capacitorPlatform = normalizePlatform(capacitor.getPlatform?.() ?? capacitor.platform);

      if (capacitorPlatform) {
        return capacitorPlatform;
      }
    } catch {
      // Fall through to user-agent detection.
    }
  }

  const agent = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  if (!agent.trim()) {
    return "unknown";
  }

  if (/Android|;\s*wv\)/i.test(agent)) {
    return "android";
  }

  if (/Electron/i.test(agent)) {
    return "electron";
  }

  if (/iPhone|iPad|iPod/i.test(agent)) {
    return "ios";
  }

  if (/Macintosh|Mac OS X/i.test(agent)) {
    return "macos";
  }

  if (/Mozilla|Chrome|Safari|Firefox|Edg/i.test(agent)) {
    return "web";
  }

  return "unknown";
}

function getPrimaryDownloadUrl(release: UpdateReleaseInfo, platform: UpdatePlatform) {
  if (platform === "android") {
    return release.apk_url;
  }

  if (platform === "windows" || platform === "electron") {
    return release.exe_url;
  }

  if (platform === "ios" || platform === "macos") {
    return release.download_page;
  }

  if (platform === "web") {
    return release.web_url;
  }

  return release.download_page;
}

function firstAvailableUrl(...urls: string[]) {
  return urls.find((url) => url.trim().length > 0) ?? "";
}

export function resolveDownload(
  release: UpdateReleaseInfo,
  appKind: UpdateAppKind,
  platform = detectPlatform()
): UpdateDownloadTarget {
  const appLabel = appKind === "admin" ? "Admin" : "User";

  return {
    platform,
    label: `${appLabel} ${platformLabels[platform]}`,
    url: firstAvailableUrl(
      getPrimaryDownloadUrl(release, platform),
      release.download_page,
      release.web_url,
      release.apk_url,
      release.exe_url
    )
  };
}

function getLinkWindow(): LinkWindowLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as unknown as LinkWindowLike;
}

export function openLink(url: string, linkWindow = getLinkWindow()) {
  const targetUrl = url.trim();

  if (!targetUrl || !linkWindow) {
    return false;
  }

  try {
    if (linkWindow.AndroidBridge?.openUrl) {
      void linkWindow.AndroidBridge.openUrl(targetUrl);
      return true;
    }
  } catch {
    // Fall through to the cross-platform handlers.
  }

  const openExternal = linkWindow.electron?.shell?.openExternal
    ?? linkWindow.electron?.openExternal
    ?? linkWindow.aiKnowledge?.openExternal;

  if (openExternal) {
    try {
      void openExternal(targetUrl);
      return true;
    } catch {
      // Fall through to browser navigation.
    }
  }

  let openedWindow: { opener?: unknown } | null = null;

  try {
    openedWindow = linkWindow.open?.(targetUrl, "_blank") ?? null;
  } catch {
    openedWindow = null;
  }

  if (openedWindow) {
    try {
      openedWindow.opener = null;
    } catch {
      // Some WebViews expose a read-only opener. The navigation already succeeded.
    }

    return true;
  }

  if (linkWindow.location?.assign) {
    try {
      linkWindow.location.assign(targetUrl);
      return true;
    } catch {
      // Fall through to href assignment.
    }
  }

  if (linkWindow.location) {
    try {
      linkWindow.location.href = targetUrl;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

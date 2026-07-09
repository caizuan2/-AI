"use client";

import * as React from "react";
import {
  canDismissUpdate,
  shouldSkipUpdateNotice,
  snoozeUpdateNotice,
  type AppUpdateResult
} from "@/lib/app-update";
import { type AppKind } from "@/lib/app-version";
import { checkCurrentAppUpdate } from "@/lib/update-checker";
import { detectPlatform, openLink, resolveDownload, type UpdatePlatform } from "@/lib/update-core";
import { UpdateModal } from "@/components/UpdateModal";

type UpdateInstallPhase = "idle" | "preparing" | "downloading" | "installing" | "ready" | "error";

export interface UpdateInstallState {
  phase: UpdateInstallPhase;
  progress: number;
  message: string;
  error?: string;
}

interface UpdateProgressDetail {
  phase?: UpdateInstallPhase;
  status?: UpdateInstallPhase;
  progress?: number;
  message?: string;
  error?: string;
}

interface UpdateRuntimeWindow extends Window {
  AndroidBridge?: {
    downloadUpdate?: (url: string, fileName: string) => unknown;
    openUrl?: (url: string) => unknown;
  };
  aiKnowledge?: {
    downloadAndInstallUpdate?: (
      payload: { url: string; fileName: string }
    ) => Promise<{ ok?: boolean; error?: string } | boolean | void> | { ok?: boolean; error?: string } | boolean | void;
    onUpdateDownloadProgress?: (callback: (detail: UpdateProgressDetail) => void) => (() => void) | void;
    openExternal?: (url: string) => unknown;
  };
}

interface AppUpdateNoticeProps {
  appKind: AppKind;
  currentVersion?: string;
  currentBuild?: number;
  currentWebReleaseSha?: string;
}

interface AppUpdateNoticeDialogProps {
  appKind: AppKind;
  update: AppUpdateResult & { latest: NonNullable<AppUpdateResult["latest"]> };
  updateUrl: string;
  platform: UpdatePlatform;
  dismissible: boolean;
  installState?: UpdateInstallState;
  onUpdateNow: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSnooze: () => void;
}

const idleInstallState: UpdateInstallState = {
  phase: "idle",
  progress: 0,
  message: ""
};

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function clearLegacyForceUpdateState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem("force_update");
  } catch {
    // Storage can be unavailable in some WebView privacy modes.
  }

  try {
    window.sessionStorage.removeItem("force_update");
  } catch {
    // Storage can be unavailable in some WebView privacy modes.
  }
}

function reloadCurrentWebShell() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("__web_update", String(Date.now()));
    window.location.replace(nextUrl.toString());
    return true;
  } catch {
    try {
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }
}

function getRuntimeWindow() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as UpdateRuntimeWindow;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function getInstallerFileName(targetUrl: string, platform: UpdatePlatform) {
  const fallback = platform === "android" ? "小董AI.apk" : "小董AI.exe";

  try {
    const pathname = new URL(targetUrl).pathname;
    const fileName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    const expectedExtension = platform === "android" ? ".apk" : ".exe";

    if (fileName.toLowerCase().endsWith(expectedExtension)) {
      return fileName;
    }
  } catch {
    // Fall back to the branded installer name.
  }

  return fallback;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow?.document) {
    return false;
  }

  const blobUrl = URL.createObjectURL(blob);
  const anchor = runtimeWindow.document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  runtimeWindow.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  return true;
}

async function downloadWithBrowserFetch(
  targetUrl: string,
  fileName: string,
  onProgress: (state: UpdateInstallState) => void
) {
  onProgress({
    phase: "downloading",
    progress: 12,
    message: "正在当前应用内下载更新包..."
  });

  const response = await fetch(targetUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`下载地址不可用（HTTP ${response.status}）。`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();

  if (!reader) {
    const blob = await response.blob();
    triggerBrowserDownload(blob, fileName);
    return;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      const progress = total > 0 ? 12 + (loaded / total) * 78 : Math.min(90, 12 + chunks.length * 4);
      onProgress({
        phase: "downloading",
        progress: clampProgress(progress),
        message: "正在当前应用内下载更新包..."
      });
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  triggerBrowserDownload(blob, fileName);
}

export function AppUpdateNotice({
  appKind,
  currentVersion,
  currentBuild,
  currentWebReleaseSha
}: AppUpdateNoticeProps) {
  const [update, setUpdate] = React.useState<AppUpdateResult | null>(null);
  const [installState, setInstallState] = React.useState<UpdateInstallState>(idleInstallState);

  React.useEffect(() => {
    const applyProgressDetail = (detail: UpdateProgressDetail) => {
      const phase = detail.phase ?? detail.status ?? "downloading";

      setInstallState({
        phase,
        progress: clampProgress(detail.progress ?? (phase === "ready" ? 100 : 35)),
        message: detail.message || (phase === "ready" ? "更新包已下载完成，正在打开安装程序。" : "正在下载更新包..."),
        error: detail.error
      });
    };
    const runtimeWindow = getRuntimeWindow();
    const unsubscribe = runtimeWindow?.aiKnowledge?.onUpdateDownloadProgress?.(applyProgressDetail);
    const handleBrowserProgress = (event: Event) => {
      applyProgressDetail((event as CustomEvent<UpdateProgressDetail>).detail ?? {});
    };

    runtimeWindow?.addEventListener("ai-knowledge-update-progress", handleBrowserProgress);

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }

      runtimeWindow?.removeEventListener("ai-knowledge-update-progress", handleBrowserProgress);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function checkUpdate() {
      clearLegacyForceUpdateState();

      const result = await checkCurrentAppUpdate({
        appKind,
        currentVersion,
        currentBuild,
        currentWebReleaseSha
      });

      if (cancelled || !result.hasUpdate || !result.latest) {
        return;
      }

      const snoozeWebReleaseSha = result.updateKind === "web" ? result.latest.web_release_sha ?? "" : "";

      if (
        !result.forceUpdate &&
        shouldSkipUpdateNotice(appKind, result.latest.build, getStorage(), Date.now(), snoozeWebReleaseSha)
      ) {
        return;
      }

      setUpdate(result);
    }

    void checkUpdate();

    return () => {
      cancelled = true;
    };
  }, [appKind, currentBuild, currentVersion, currentWebReleaseSha]);

  const currentUpdate = update;

  if (!currentUpdate?.hasUpdate || !currentUpdate.latest) {
    return null;
  }

  const activeUpdate = currentUpdate;
  const latest = currentUpdate.latest;
  const dismissible = canDismissUpdate(currentUpdate);
  const updateTarget = resolveDownload(latest, appKind, detectPlatform());
  const { platform, url: updateUrl } = updateTarget;

  async function handleUpdateNow(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    if (activeUpdate.updateKind === "web" && reloadCurrentWebShell()) {
      setInstallState({
        phase: "ready",
        progress: 100,
        message: "正在刷新当前应用内容..."
      });
      setUpdate(null);
      return;
    }

    const targetUrl = updateUrl || latest.download_page;

    if (appKind !== "user") {
      openLink(targetUrl);
      return;
    }

    if (!targetUrl) {
      setInstallState({
        phase: "error",
        progress: 0,
        message: "没有找到可用的更新地址。",
        error: "请稍后再试，或联系管理员补充安装包地址。"
      });
      return;
    }

    const fileName = getInstallerFileName(targetUrl, platform);
    const runtimeWindow = getRuntimeWindow();

    setInstallState({
      phase: "preparing",
      progress: 5,
      message: "正在准备应用内更新..."
    });

    try {
      if (runtimeWindow?.aiKnowledge?.downloadAndInstallUpdate) {
        const result = await runtimeWindow.aiKnowledge.downloadAndInstallUpdate({ url: targetUrl, fileName });
        if (typeof result === "object" && result?.ok === false) {
          throw new Error(result.error || "桌面端更新下载失败。");
        }

        setInstallState({
          phase: "ready",
          progress: 100,
          message: "更新包已下载完成，安装程序已打开。"
        });
        return;
      }

      if (platform === "android" && runtimeWindow?.AndroidBridge?.downloadUpdate) {
        runtimeWindow.AndroidBridge.downloadUpdate(targetUrl, fileName);
        setInstallState({
          phase: "installing",
          progress: 70,
          message: "已在应用内开始下载 APK，请按系统安装提示完成更新。"
        });
        return;
      }

      await downloadWithBrowserFetch(targetUrl, fileName, setInstallState);
      setInstallState({
        phase: "ready",
        progress: 100,
        message: "更新包已下载完成，请按浏览器或系统下载提示完成安装。"
      });
    } catch (error) {
      setInstallState({
        phase: "error",
        progress: 0,
        message: "更新包下载失败。",
        error: error instanceof Error ? error.message : "请稍后再试，或联系管理员检查下载地址。"
      });
    }
  }

  function handleSnooze() {
    if (!dismissible) {
      return;
    }

    snoozeUpdateNotice(
      appKind,
      latest.build,
      getStorage(),
      Date.now(),
      activeUpdate.updateKind === "web" ? latest.web_release_sha ?? "" : ""
    );
    setUpdate(null);
  }

  return (
    <AppUpdateNoticeDialog
      appKind={appKind}
      update={{ ...activeUpdate, latest }}
      updateUrl={updateUrl}
      platform={platform}
      dismissible={dismissible}
      installState={installState}
      onUpdateNow={handleUpdateNow}
      onSnooze={handleSnooze}
    />
  );
}

export function AppUpdateNoticeDialog({
  appKind,
  update,
  updateUrl,
  platform,
  dismissible,
  installState,
  onUpdateNow,
  onSnooze
}: AppUpdateNoticeDialogProps) {
  return (
    <UpdateModal
      appKind={appKind}
      update={update}
      updateUrl={updateUrl}
      platform={platform}
      dismissible={dismissible}
      installState={installState}
      onUpdateNow={onUpdateNow}
      onSnooze={onSnooze}
    />
  );
}

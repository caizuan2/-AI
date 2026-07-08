"use client";

import * as React from "react";
import {
  canDismissUpdate,
  shouldSkipUpdateNotice,
  snoozeUpdateNotice,
  type AppUpdateResult
} from "@/lib/app-update";
import { APP_BUILD, APP_VERSION, APP_WEB_RELEASE_SHA, type AppKind } from "@/lib/app-version";
import { checkCurrentAppUpdate } from "@/lib/update-checker";
import { detectPlatform, openLink, resolveDownload, type UpdatePlatform } from "@/lib/update-core";
import { UpdateModal } from "@/components/UpdateModal";

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
  onUpdateNow: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onSnooze: () => void;
}

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

export function AppUpdateNotice({
  appKind,
  currentVersion = APP_VERSION,
  currentBuild = APP_BUILD,
  currentWebReleaseSha = APP_WEB_RELEASE_SHA
}: AppUpdateNoticeProps) {
  const [update, setUpdate] = React.useState<AppUpdateResult | null>(null);

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

  function handleUpdateNow(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    if (activeUpdate.updateKind === "web" && reloadCurrentWebShell()) {
      setUpdate(null);
      return;
    }

    openLink(updateUrl || latest.download_page);
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
      onUpdateNow={onUpdateNow}
      onSnooze={onSnooze}
    />
  );
}

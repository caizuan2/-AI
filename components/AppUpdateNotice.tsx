"use client";

import * as React from "react";
import { Download, RefreshCw, X } from "lucide-react";
import {
  canDismissUpdate,
  checkAppUpdate,
  detectAppPlatform,
  resolveUpdateUrl,
  shouldSkipUpdateNotice,
  snoozeUpdateNotice,
  type AppUpdateResult
} from "@/lib/app-update";
import { APP_BUILD, APP_VERSION, type AppKind } from "@/lib/app-version";
import { Button } from "@/components/ui/button";

interface AppUpdateNoticeProps {
  appKind: AppKind;
  currentVersion?: string;
  currentBuild?: number;
}

interface AppUpdateNoticeDialogProps {
  appKind: AppKind;
  update: AppUpdateResult & { latest: NonNullable<AppUpdateResult["latest"]> };
  updateUrl: string;
  platform: ReturnType<typeof detectAppPlatform>;
  dismissible: boolean;
  onUpdateNow: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onSnooze: () => void;
}

const platformUpdateTips: Record<ReturnType<typeof detectAppPlatform>, string> = {
  android: "Android 安装包需要下载后手动安装；如提示未知来源，请在系统设置中允许安装。",
  windows: "Windows 安装包将通过 EXE 下载链接获取，下载后按提示安装即可。",
  ios: "iOS 端请打开下载页查看当前可用入口。",
  macos: "macOS 端请打开下载页查看当前可用入口。",
  web: "Web 端会打开最新在线地址，无需安装。",
  unknown: "将打开下载页，请选择适合当前设备的安装入口。"
};

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function AppUpdateNotice({
  appKind,
  currentVersion = APP_VERSION,
  currentBuild = APP_BUILD
}: AppUpdateNoticeProps) {
  const [update, setUpdate] = React.useState<AppUpdateResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function checkUpdate() {
      const result = await checkAppUpdate({
        appKind,
        currentVersion,
        currentBuild
      });

      if (cancelled || !result.hasUpdate || !result.latest) {
        return;
      }

      if (
        !result.forceUpdate &&
        shouldSkipUpdateNotice(appKind, result.latest.build, getStorage())
      ) {
        return;
      }

      setUpdate(result);
    }

    void checkUpdate();

    return () => {
      cancelled = true;
    };
  }, [appKind, currentBuild, currentVersion]);

  const currentUpdate = update;

  if (!currentUpdate?.hasUpdate || !currentUpdate.latest) {
    return null;
  }

  const latest = currentUpdate.latest;
  const dismissible = canDismissUpdate(currentUpdate);
  const platform = detectAppPlatform();
  const updateUrl = resolveUpdateUrl(latest, platform);

  function handleUpdateNow(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!updateUrl) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    window.location.assign(updateUrl);
  }

  function handleSnooze() {
    if (!dismissible) {
      return;
    }

    snoozeUpdateNotice(appKind, latest.build, getStorage());
    setUpdate(null);
  }

  return (
    <AppUpdateNoticeDialog
      appKind={appKind}
      update={{ ...currentUpdate, latest }}
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
  const latest = update.latest;
  const updateTip = platformUpdateTips[platform];

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${appKind}-app-update-title`}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <RefreshCw className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${appKind}-app-update-title`} className="text-lg font-bold text-slate-950">
              发现新版本
            </h2>
            <p className="mt-1 text-sm font-semibold text-blue-700">{latest.app_name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              当前版本：{update.currentVersion}（Build {update.currentBuild}）
              <br />
              最新版本：{latest.version}（Build {latest.build}）
            </p>
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onSnooze}
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="稍后提醒"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">更新内容：</p>
          {latest.changelog.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
              {latest.changelog.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">暂无更新说明。</p>
          )}
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">{updateTip}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={updateUrl || latest.download_page}
            onClick={onUpdateNow}
            className="focus-ring inline-flex h-14 min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-base font-bold text-white shadow-sm transition hover:bg-blue-700"
            aria-label={`立即更新 ${latest.app_name}`}
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            立即更新
          </a>
          {dismissible ? (
            <Button type="button" variant="outline" onClick={onSnooze} className="h-14 min-h-14 flex-1 rounded-xl px-6 text-base font-bold">
              稍后提醒
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

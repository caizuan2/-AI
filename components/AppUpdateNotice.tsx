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

  function handleUpdateNow() {
    const targetUrl = resolveUpdateUrl(latest, detectAppPlatform());

    if (targetUrl) {
      window.location.href = targetUrl;
    }
  }

  function handleSnooze() {
    if (!dismissible) {
      return;
    }

    snoozeUpdateNotice(appKind, latest.build, getStorage());
    setUpdate(null);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${appKind}-app-update-title`}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${appKind}-app-update-title`} className="text-base font-bold text-slate-950">
              发现新版本
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              当前版本：{currentUpdate.currentVersion}
              <br />
              最新版本：{latest.version}
            </p>
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={handleSnooze}
              className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="稍后提醒"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {latest.changelog.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">更新内容：</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
              {latest.changelog.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Android 安装包需要下载后手动安装；如提示未知来源，请在系统设置中允许安装。
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={handleUpdateNow} className="flex-1">
            <Download className="h-4 w-4" aria-hidden="true" />
            立即更新
          </Button>
          {dismissible ? (
            <Button type="button" variant="outline" onClick={handleSnooze} className="flex-1">
              稍后提醒
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

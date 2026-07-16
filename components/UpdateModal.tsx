"use client";

import * as React from "react";
import { Download, RefreshCw, X } from "lucide-react";
import type { AppKind } from "@/lib/app-version";
import type { AppUpdateResult } from "@/lib/app-update";
import type { UpdatePlatform } from "@/lib/update-core";
import { Button } from "@/components/ui/button";

interface UpdateModalProps {
  appKind: AppKind;
  update: AppUpdateResult & { latest: NonNullable<AppUpdateResult["latest"]> };
  updateUrl: string;
  platform: UpdatePlatform;
  dismissible: boolean;
  installState?: UpdateInstallState;
  onUpdateNow: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSnooze: () => void;
}

type UpdateInstallPhase = "idle" | "preparing" | "downloading" | "installing" | "ready" | "error";

interface UpdateInstallState {
  phase: UpdateInstallPhase;
  progress: number;
  message: string;
  error?: string;
}

const platformUpdateTips: Record<UpdatePlatform, string> = {
  android: "Android 会在当前应用内下载更新，进度完成后自动打开安装界面，不会跳转浏览器。",
  windows: "Windows 会在当前应用内下载更新，进度完成后自动进入安装流程，不会弹出浏览器下载。",
  ios: "iOS 端请打开下载页查看当前可用入口。",
  macos: "macOS 端请打开下载页查看当前可用入口。",
  web: "Web 端会在当前应用内加载最新内容，进度完成后自动进入系统，无需安装。",
  electron: "桌面端会在当前应用内下载更新，进度完成后自动进入安装流程，不会弹出浏览器下载。",
  unknown: "当前客户端如果不支持应用内更新，会提示重新下载安装新版小董AI。"
};

const idleInstallState: UpdateInstallState = {
  phase: "idle",
  progress: 0,
  message: ""
};

function isInstallBusy(phase: UpdateInstallPhase) {
  return phase === "preparing" || phase === "downloading" || phase === "installing";
}

export function UpdateModal({
  appKind,
  update,
  updateUrl,
  platform,
  dismissible,
  installState,
  onUpdateNow,
  onSnooze
}: UpdateModalProps) {
  const latest = update.latest;
  const isWebContentUpdate = update.updateKind === "web";
  const activeInstallState = installState ?? idleInstallState;
  const busy = isInstallBusy(activeInstallState.phase);
  const hasInstallFeedback = activeInstallState.phase !== "idle";
  const installProgress = Math.max(0, Math.min(100, Math.round(activeInstallState.progress || 0)));
  const updateTip = isWebContentUpdate
    ? "这是线上内容更新，点击后会在当前应用内加载最新内容，进度完成后自动进入系统，不需要重新安装 APK/EXE。"
    : platformUpdateTips[platform];
  const ActionIcon = isWebContentUpdate ? RefreshCw : Download;
  const updateTitle = isWebContentUpdate ? "发现内容更新" : "发现新版本";
  const updateActionDisabled = busy || activeInstallState.phase === "ready";
  const updateActionText = activeInstallState.phase === "ready"
    ? "更新完成"
    : busy
      ? "正在更新"
      : "立即更新";
  const displayAppName = appKind === "user" ? "小董AI" : latest.app_name;

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
              {updateTitle}
            </h2>
            <p className="mt-1 text-sm font-semibold text-blue-700">{displayAppName}</p>
            {!isWebContentUpdate ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                当前版本：{update.currentVersion}（Build {update.currentBuild}）
                <br />
                最新版本：{latest.version}（Build {latest.build}）
              </p>
            ) : null}
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

        {!dismissible ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            必须更新到最新版本后才能继续使用。
          </div>
        ) : null}

        {!isWebContentUpdate ? (
          <>
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
          </>
        ) : null}

        {hasInstallFeedback ? (
          <div
            className={
              activeInstallState.phase === "error"
                ? "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                : "mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 font-semibold">{activeInstallState.message}</span>
              <span className="shrink-0 text-xs font-bold">{installProgress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
              <div
                className={activeInstallState.phase === "error" ? "h-full rounded-full bg-rose-500" : "h-full rounded-full bg-blue-600"}
                style={{ width: `${installProgress}%` }}
              />
            </div>
            {activeInstallState.error ? (
              <p className="mt-2 text-xs leading-5">{activeInstallState.error}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            data-update-url={updateUrl || latest.download_page}
            onClick={onUpdateNow}
            disabled={updateActionDisabled}
            className="focus-ring inline-flex h-14 min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-default disabled:bg-blue-500"
            aria-label={`${updateActionText} ${displayAppName}`}
          >
            <ActionIcon className={busy ? "h-5 w-5 animate-spin" : "h-5 w-5"} aria-hidden="true" />
            {updateActionText}
          </button>
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

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { SyncHealthBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import { fetchSyncOverview, type SuperAdminSyncClientResult } from "@/lib/super-admin/sync-client";
import type { SyncOverview } from "@/types/super-admin-sync";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

export function HomeSyncSnapshot() {
  const [result, setResult] = useState<SuperAdminSyncClientResult<SyncOverview> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchSyncOverview().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载三端同步概览" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok || !result.data) {
    return <ErrorState message={result.error} />;
  }

  const overview = result.data;
  const metrics = [
    ["Web 状态", overview.platforms.find((item) => item.platform === "web")?.syncHealth ?? "unknown"],
    ["APK 状态", overview.platforms.find((item) => item.platform === "android_apk")?.syncHealth ?? "unknown"],
    ["EXE 状态", overview.platforms.find((item) => item.platform === "windows_exe")?.syncHealth ?? "unknown"],
    ["在线设备", formatNumber(overview.summary.onlineDeviceCount)],
    ["同步失败", formatNumber(overview.summary.failedSyncCount)],
    ["最近同步", overview.summary.lastSyncAt],
    ["数据一致性", overview.summary.consistencyStatus]
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">Cross-platform Sync</p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">三端同步概览</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Web、Android APK、Windows EXE 使用同一账号体系、同一后端和同一数据源，所有管理状态按跨端一致性设计。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["/super-admin/sync", "三端同步控制中心"],
            ["/super-admin/devices", "设备会话管理"],
            ["/super-admin/platforms", "平台版本状态"],
            ["/super-admin/downloads", "下载与更新中心"]
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="truncate text-xs text-slate-500">{label}</p>
            <div className="mt-2">
              {label === "数据一致性" ? (
                <SyncHealthBadge health={overview.summary.consistencyStatus} />
              ) : (
                <p className="text-base font-semibold tracking-normal text-slate-950">{value}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

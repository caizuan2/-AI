import { AlertTriangle, Clock, Laptop, Radio, Smartphone, type LucideIcon } from "lucide-react";
import { DevicePlatformBadge } from "@/components/super-admin/devices/DevicePlatformBadge";
import { SyncHealthBadge } from "@/components/super-admin/sync/SyncStatusBadge";
import type { SyncOverview } from "@/types/super-admin-sync";

type SummaryCard = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
};

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

export function SyncOverviewCards({ overview }: { overview: SyncOverview }) {
  const summaryCards: SummaryCard[] = [
    {
      label: "当前在线设备数",
      value: formatNumber(overview.summary.onlineDeviceCount),
      hint: "Web / APK / EXE 活跃会话",
      icon: Laptop
    },
    {
      label: "最近同步时间",
      value: overview.summary.lastSyncAt,
      hint: "所有平台共享后端数据源",
      icon: Clock
    },
    {
      label: "待同步数量",
      value: formatNumber(overview.summary.pendingSyncCount),
      hint: "等待同步队列处理",
      icon: Radio
    },
    {
      label: "同步失败数量",
      value: formatNumber(overview.summary.failedSyncCount),
      hint: "需要后续重试或人工检查",
      icon: AlertTriangle
    },
    {
      label: "平均同步延迟",
      value: `${formatNumber(overview.summary.averageLatencyMs)}ms`,
      hint: "三端同步链路 mock 延迟",
      icon: Radio
    },
    {
      label: "冲突数量",
      value: formatNumber(overview.summary.conflictCount),
      hint: "跨端并发写入冲突",
      icon: AlertTriangle
    }
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-3">
        {overview.platforms.map((platform) => (
          <article key={platform.platform} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DevicePlatformBadge platform={platform.platform} />
                <h2 className="mt-3 text-lg font-semibold tracking-normal text-slate-950">
                  {platform.version}
                </h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Smartphone className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SyncHealthBadge health={platform.syncHealth} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {platform.onlineStatus}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm text-slate-600">
              <div className="flex justify-between gap-3">
                <dt>最近同步</dt>
                <dd className="font-medium text-slate-950">{platform.lastSyncAt}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>待同步 / 失败</dt>
                <dd className="font-medium text-slate-950">
                  {platform.pendingSyncCount} / {platform.failedSyncCount}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>延迟 / 冲突</dt>
                <dd className="font-medium text-slate-950">
                  {platform.latencyMs}ms / {platform.conflictCount}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-xl font-semibold tracking-normal text-slate-950">{card.value}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{card.hint}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
